import { run } from 'node:test';
import path from 'node:path';
import { inspect } from 'node:util';

// Runs outside the snapshot. Test stdout stays data in the TestsStream.
let request = '';
for await (const chunk of process.stdin) request += chunk;
const files = JSON.parse(request).files.map(file => path.resolve(file));
const results = [];
let summary = null;
let log = '';
let truncated = false;
const relative = file => file ? path.relative(process.cwd(), file).split(path.sep).join('/') : null;
function errorInfo(error, depth = 0) {
  if (!error || depth > 2) return null;
  const value = input => inspect(input, { depth: 3, sorted: true, maxArrayLength: 20, maxStringLength: 1000 }).slice(0, 2000);
  return { name: error.name === undefined ? undefined : String(error.name), code: error.code === undefined ? undefined : String(error.code), message: String(error.message ?? error).slice(0, 4000), failureType: error.failureType === undefined ? undefined : String(error.failureType), ...(Object.hasOwn(Object(error), 'actual') ? { actual: value(error.actual), expected: value(error.expected), operator: error.operator === undefined ? undefined : String(error.operator) } : {}), cause: errorInfo(error.cause, depth + 1) };
}
try {
  for await (const { type, data } of run({ files, concurrency: 1, isolation: 'process', execArgv: [] })) {
    if (type === 'test:summary' && !data.file) summary = data;
    if (type === 'test:pass' || type === 'test:fail') {
      if (results.length >= 2000) { truncated = true; continue; }
      const name = String(data.name);
      results.push({ name, file: relative(data.file), line: data.line ?? null, column: data.column ?? null, nesting: data.nesting, type: data.details?.type, passed: type === 'test:pass', skipped: Boolean(data.skip), todo: Boolean(data.todo), fileWrapper: files.some(file => name === file || name === relative(file)), error: errorInfo(data.details?.error) });
    }
    if (['test:stdout', 'test:stderr', 'test:diagnostic'].includes(type)) {
      const text = String(data.message || '');
      if (log.length + text.length <= 32000) log += text + '\n';
      else truncated = true;
    }
  }
  process.stdout.write(JSON.stringify({ results, summary, log, truncated }));
  process.exitCode = summary?.success ? 0 : 1;
} catch (error) {
  process.stdout.write(JSON.stringify({ results, summary, log, truncated, workerError: errorInfo(error) }));
  process.exitCode = 2;
}
