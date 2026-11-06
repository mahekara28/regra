export const examples = [
  {
    id: 'empty-average', label: 'An empty list', description: 'A small analytics function crashes when there are no values.',
    spec: {
      project: 'demo-analytics', entry: 'average', title: 'An empty list has an average of zero',
      repro: { name: 'Empty input returns zero', args: [[]], expect: 0 },
      checks: [
        { name: 'Positive numbers', args: [[2, 4, 6]], expect: 4 },
        { name: 'A single number', args: [[7]], expect: 7 },
        { name: 'Negative numbers', args: [[-8, -4]], expect: -6 },
        { name: 'Zero is a valid value', args: [[0, 0]], expect: 0 }
      ]
    },
    before: 'function average(values) {\n  return values.reduce((sum, value) => sum + value)\n    / values.length;\n}',
    after: 'function average(values) {\n  if (values.length === 0) return 0;\n  return values.reduce((sum, value) => sum + value, 0)\n    / values.length;\n}',
    bad: 'function average(values) {\n  // Stops the crash, but loses the real calculation.\n  return 0;\n}'
  },
  {
    id: 'slug-spaces', label: 'Unexpected whitespace', description: 'A URL helper turns surrounding spaces into stray hyphens.',
    spec: {
      project: 'demo-content', entry: 'slugify', title: 'Trim whitespace before making a URL slug',
      repro: { name: 'Ignore surrounding spaces', args: ['  Hello World  '], expect: 'hello-world' },
      checks: [
        { name: 'Keep word separators', args: ['Hello World'], expect: 'hello-world' },
        { name: 'Lowercase one word', args: ['REGRA'], expect: 'regra' },
        { name: 'Empty text stays empty', args: [''], expect: '' }
      ]
    },
    before: 'function slugify(text) {\n  return text.toLowerCase().replace(/\\s+/g, "-");\n}',
    after: 'function slugify(text) {\n  return text.trim().toLowerCase().replace(/\\s+/g, "-");\n}',
    bad: 'function slugify(text) {\n  return "hello-world";\n}'
  },
  {
    id: 'first-item', label: 'A missing result', description: 'A search result helper assumes there is always a first item.',
    spec: {
      project: 'demo-search', entry: 'firstName', title: 'An empty result list returns null',
      repro: { name: 'No results means no name', args: [[]], expect: null },
      checks: [
        { name: 'Read the first result', args: [[{name: 'Ada'}, {name: 'Lin'}]], expect: 'Ada' },
        { name: 'Keep an empty name', args: [[{name: ''}]], expect: '' },
        { name: 'Keep an explicit null', args: [[{name: null}]], expect: null }
      ]
    },
    before: 'function firstName(items) {\n  return items[0].name;\n}',
    after: 'function firstName(items) {\n  if (items.length === 0) return null;\n  return items[0].name;\n}',
    bad: 'function firstName(items) {\n  return null;\n}'
  }
];
