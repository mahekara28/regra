// Prepared, trusted examples only. This browser demonstration never evaluates source text.
export const examples = [
  {
    id: 'empty-average', label: '01 / Empty input', entry: 'average', file: 'average.js',
    title: 'An empty list should return zero.',
    description: 'An analytics helper works with numbers, but crashes when there are none. Can the repair preserve both behaviors?',
    lesson: 'An empty list has an average of zero',
    before: function average(values) {
      return values.reduce((sum, value) => sum + value)
        / values.length;
    },
    incomplete: function average(values) {
      // No crash. But no calculation, either.
      return 0;
    },
    correct: function average(values) {
      if (values.length === 0) return 0;
      return values.reduce((sum, value) => sum + value, 0)
        / values.length;
    },
    cases: [
      { name: 'Empty input', args: [[]], expect: 0 },
      { name: 'Positive numbers', args: [[2, 4, 6]], expect: 4 },
      { name: 'One number', args: [[7]], expect: 7 },
      { name: 'Negative numbers', args: [[-8, -4]], expect: -6 },
      { name: 'Zero values', args: [[0, 0]], expect: 0 }
    ]
  },
  {
    id: 'slug-spaces', label: '02 / Whitespace', entry: 'slugify', file: 'slugify.js',
    title: 'Surrounding spaces should stay out of a URL.',
    description: 'A URL helper adds stray hyphens. Fix the extra spaces without losing normal word separators.',
    lesson: 'Trim whitespace before making a URL slug',
    before: function slugify(text) {
      return text.toLowerCase().replace(/\s+/g, '-');
    },
    incomplete: function slugify(text) {
      return 'hello-world';
    },
    correct: function slugify(text) {
      return text.trim().toLowerCase().replace(/\s+/g, '-');
    },
    cases: [
      { name: 'Surrounding spaces', args: ['  Hello World  '], expect: 'hello-world' },
      { name: 'Word separators', args: ['Hello World'], expect: 'hello-world' },
      { name: 'One word', args: ['REGRA'], expect: 'regra' },
      { name: 'Empty text', args: [''], expect: '' }
    ]
  },
  {
    id: 'first-item', label: '03 / Missing result', entry: 'firstName', file: 'first-name.js',
    title: 'No search results should mean no name.',
    description: 'This helper assumes a result always exists. Handle an empty list while keeping the names that are actually there.',
    lesson: 'An empty result list returns null',
    before: function firstName(items) {
      return items[0].name;
    },
    incomplete: function firstName(items) {
      return null;
    },
    correct: function firstName(items) {
      if (items.length === 0) return null;
      return items[0].name;
    },
    cases: [
      { name: 'No results', args: [[]], expect: null },
      { name: 'First result', args: [[{ name: 'Ada' }, { name: 'Lin' }]], expect: 'Ada' },
      { name: 'Empty name', args: [[{ name: '' }]], expect: '' },
      { name: 'Explicit null', args: [[{ name: null }]], expect: null }
    ]
  }
];

export const REPEATS = 3;

export function executePrepared(fn, cases) {
  return cases.map(test => {
    const observations = Array.from({ length: REPEATS }, () => {
      try {
        const value = fn(...structuredClone(test.args));
        // These teaching cases have primitive expected outputs.
        return { passed: Object.is(value, test.expect), value };
      } catch (error) {
        return { passed: false, error: error.name };
      }
    });
    return { ...structuredClone(test), passed: observations.every(item => item.passed), observations };
  });
}

export function verifyPrepared(example, candidate) {
  if (!['incomplete', 'correct'].includes(candidate)) throw new Error('Choose a prepared repair.');
  const before = executePrepared(example.before, example.cases);
  const after = executePrepared(example[candidate], example.cases);
  const reproduced = before[0].observations.every(result => !result.passed);
  const preservedBaseline = before.slice(1).every(result => result.passed);
  return {
    kind: 'regra-browser-demo', example: example.id, candidate, repeats: REPEATS,
    status: reproduced && preservedBaseline && after.every(result => result.passed) ? 'verified' : 'rejected',
    before, after,
    scope: 'Prepared functions executed in the browser. This is not a recorded proof from the installed REGRA engine.'
  };
}

export function retainLesson(example, result) {
  if (result?.status !== 'verified' || result.example !== example.id) throw new Error('Verify this example before keeping its lesson.');
  return { example: example.id, entry: example.entry, title: example.lesson, cases: structuredClone(example.cases) };
}

export function replayLesson(example, lesson) {
  if (!lesson || lesson.example !== example.id) throw new Error('Keep this example’s lesson before replaying it.');
  const results = executePrepared(example.before, lesson.cases);
  return { kind: 'regra-browser-demo-replay', example: example.id, caught: results.some(result => !result.passed), results };
}

export function sourceOf(fn) {
  return fn.toString().split('\n').map((line, index) => index ? line.replace(/^ {4}/, '') : line).join('\n');
}
