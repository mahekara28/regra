import { createRegra, summarizeRun } from '@mahekara28/regra';

const regra = createRegra({ project: 'library-example', directory: '.regra' });
const spec = {
  entry: 'average', title: 'An empty list returns zero',
  repro: { name: 'Empty list', args: [[]], expect: 0 },
  checks: [{ name: 'Ordinary numbers', args: [[2, 4]], expect: 3 }]
};
const run = await regra.verify({
  spec,
  before: 'function average(values) { return values.reduce((a, b) => a + b) / values.length; }',
  after: 'function average(values) { if (!values.length) return 0; return values.reduce((a, b) => a + b, 0) / values.length; }'
});
console.log(summarizeRun(run));
// Use the decision in your own agent pipeline. REGRA does not apply or merge code.
if (run.status !== 'verified') process.exitCode = 1;
