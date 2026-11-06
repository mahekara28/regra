// Runs reviewed, synchronous snippets in a restricted child process.
// Node vm and permissions are NOT a security sandbox for hostile code.
const vm = require('node:vm');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 1500000) process.exit(2);
});
process.stdin.on('end', () => {
  try {
    const { source, entry, cases, repeats } = JSON.parse(input);
    const outcomes = [];
    let timeoutReason = null;
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const item of cases) {
        if (timeoutReason) {
          outcomes.push({ repeat, id: item.id, kind: 'invalid', detail: `Not executed: an earlier case exceeded its time limit. ${timeoutReason}` });
          continue;
        }
        const context = vm.createContext(Object.create(null), {
          codeGeneration: { strings: false, wasm: false },
          microtaskMode: 'afterEvaluate'
        });
        try {
          const exists = new vm.Script(`"use strict";\n${source}\n;typeof ${entry} === 'function'`).runInContext(context, { timeout: 1000 });
          if (!exists) throw new Error(`Define a function named ${entry}.`);
        } catch (error) {
          if (error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') timeoutReason = String(error.message);
          outcomes.push({ repeat, id: item.id, kind: 'invalid', detail: String(error.message).slice(0, 400) });
          continue;
        }
        // Only JSON literals enter the context. No host functions or objects are exposed.
        const expression = `(() => {
          try {
            const result = ${entry}(...JSON.parse(${JSON.stringify(JSON.stringify(item.args))}));
            const seen = new Set();
            const valid = value => {
              if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
              if (typeof value === 'number') return Number.isFinite(value);
              if (typeof value !== 'object' || seen.has(value)) return false;
              if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
              seen.add(value);
              const ok = Array.isArray(value) ? Array.from(value).every(valid) : Object.values(value).every(valid);
              seen.delete(value);
              return ok;
            };
            if (!valid(result)) return JSON.stringify({ kind: 'invalid', detail: 'Return a finite JSON value. Promises, undefined, NaN, dates, sparse arrays and cyclic objects are unsupported.' });
            return JSON.stringify({ kind: 'return', value: result });
          } catch (error) {
            return JSON.stringify({ kind: 'throw', name: String(error?.name || 'Error').slice(0, 80), message: String(error?.message || error).slice(0, 400) });
          }
        })()`;
        try {
          const serialized = new vm.Script(expression).runInContext(context, { timeout: 1000 });
          if (typeof serialized !== 'string' || serialized.length > 32000) throw new Error('Output exceeds 32 KB.');
          outcomes.push({ repeat, id: item.id, ...JSON.parse(serialized) });
        } catch (error) {
          if (error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') timeoutReason = String(error.message);
          outcomes.push({ repeat, id: item.id, kind: 'invalid', detail: String(error.message).slice(0, 400) });
        }
      }
    }
    process.stdout.write(JSON.stringify(outcomes));
  } catch (error) {
    process.stderr.write(String(error.message).slice(0, 500));
    process.exitCode = 2;
  }
});
