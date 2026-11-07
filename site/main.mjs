import { examples, verifyPrepared, retainLesson, replayLesson, sourceOf, contractOf } from './demo.mjs';
import { updateScene } from './scene.mjs';
import './repository.mjs';

const byId = id => document.getElementById(id);
let example = examples[0];
let candidate = 'incomplete';
let verification = null;
let replay = null;
const lessons = new Map();

function code(target, source) {
  const fragment = document.createDocumentFragment();
  const tokens = /\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:function|return|if|null|const|let)\b|\b\d+\b/g;
  let start = 0;
  for (const match of source.matchAll(tokens)) {
    fragment.append(source.slice(start, match.index));
    const span = document.createElement('span');
    span.className = `syntax-${match[0].startsWith('//') ? 'comment' : /^["']/.test(match[0]) ? 'string' : /^\d/.test(match[0]) ? 'number' : 'keyword'}`;
    span.textContent = match[0];
    fragment.append(span);
    start = match.index + match[0].length;
  }
  fragment.append(source.slice(start));
  byId(target).replaceChildren(fragment);
}

function verdict(state, title, description, symbol = '—') {
  byId('verdict').dataset.state = state;
  byId('verdict-title').textContent = title;
  byId('verdict-description').textContent = description;
  byId('verdict-symbol').textContent = symbol;
  byId('demo-announcement').textContent = `${title} ${description}`;
}

function resultCell(result) {
  const cell = document.createElement('td');
  const observation = document.createElement('span');
  observation.className = `observation ${result ? result.passed ? 'passed' : 'failed' : 'waiting'}`;
  observation.textContent = result ? result.passed ? '✓ PASS' : '× FAIL' : '—';
  if (result) {
    const value = document.createElement('span');
    value.className = 'result-value';
    const first = result.observations[0];
    value.textContent = first.error || JSON.stringify(first.value);
    observation.append(value);
  }
  cell.append(observation);
  return cell;
}

function renderResults(before = [], after = []) {
  byId('results-body').replaceChildren(...example.cases.map((test, index) => {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.append(test.name);
    const expected = document.createElement('span');
    expected.className = 'case-expectation';
    expected.textContent = `expect ${JSON.stringify(test.expect)}`;
    name.append(expected);
    row.append(name, resultCell(before[index]), resultCell(after[index]));
    return row;
  }));
}

function renderLesson() {
  const lesson = lessons.get(example.id);
  byId('lesson-receipt').hidden = !lesson;
  byId('retained-title').textContent = lesson?.title || '';
  byId('retained-count').textContent = lesson ? `${lesson.cases.length} recorded cases · kept until this page reloads` : '';
  byId('keep-lesson').disabled = verification?.status !== 'verified' || Boolean(lesson) || Boolean(replay);
  byId('replay-demo').disabled = !lesson;
  byId('download-evidence').disabled = !verification;
  updateScene({ example, candidate, verification, replay, lesson });
}

function selectExample() {
  verification = null;
  replay = null;
  byId('run-demo').disabled = false;
  byId('demo-filename').textContent = example.file;
  byId('case-count').textContent = example.cases.length;
  byId('case-title').textContent = example.title;
  byId('patch-a-label').textContent = example.patches.incomplete;
  byId('patch-b-label').textContent = example.patches.correct;
  byId('candidate-label').textContent = candidate === 'incomplete' ? 'Patch A' : 'Patch B';
  byId('case-contract').textContent = JSON.stringify(contractOf(example), null, 2);
  code('original-source', sourceOf(example.before));
  code('candidate-source', sourceOf(example[candidate]));
  document.querySelectorAll('[data-case]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.case === example.id)));
  document.querySelectorAll('[data-candidate]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.candidate === candidate)));
  renderResults();
  renderLesson();
  verdict('ready', 'Ready to check', 'Run the selected patch to compare its results with the original function.', '—');
}

document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => {
  example = examples.find(item => item.id === button.dataset.case);
  candidate = 'incomplete';
  selectExample();
}));
document.querySelectorAll('[data-candidate]').forEach(button => button.addEventListener('click', () => {
  candidate = button.dataset.candidate;
  selectExample();
}));

function runDemo() {
  verification = verifyPrepared(example, candidate);
  replay = null;
  renderResults(verification.before, verification.after);
  const failures = verification.after.filter(test => !test.passed).length;
  if (verification.status === 'verified') {
    verdict('verified', `Verified · ${example.cases.length} of ${example.cases.length} cases pass`, 'The original failure is reproduced and existing behavior is preserved. You can save these checks as a lesson.', '✓');
  } else {
    verdict('rejected', `Rejected · ${failures} of ${example.cases.length} cases fail`, `The reported bug is fixed, but ${failures} existing ${failures === 1 ? 'check fails' : 'checks fail'}. Review the results or select another patch.`, '×');
  }
  renderLesson();
}
byId('run-demo').addEventListener('click', runDemo);

byId('keep-lesson').addEventListener('click', () => {
  if (verification?.status !== 'verified' || lessons.has(example.id)) return;
  lessons.set(example.id, retainLesson(example, verification));
  verdict('saved', 'Lesson saved', 'Replay the original function to check it against these saved expectations.', '✓');
  renderLesson();
});

byId('replay-demo').addEventListener('click', () => {
  const lesson = lessons.get(example.id);
  if (!lesson) return;
  replay = replayLesson(example, lesson);
  byId('run-demo').disabled = true;
  code('candidate-source', sourceOf(example.before));
  byId('candidate-label').textContent = 'Original function · replay';
  document.querySelectorAll('[data-candidate]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  renderResults(verification?.before, replay.results);
  verdict(replay.caught ? 'caught' : 'verified', replay.caught ? 'Regression detected' : 'Saved checks passed', 'After now shows the original function checked against the saved lesson. Select a patch to return to verification.', replay.caught ? '×' : '✓');
  renderLesson();
});

byId('reset-demo').addEventListener('click', () => {
  lessons.clear();
  example = examples[0];
  candidate = 'incomplete';
  selectExample();
  byId('demo-announcement').textContent = 'All demo lessons and results cleared. Empty input example selected.';
});

byId('download-evidence').addEventListener('click', () => {
  if (!verification) return;
  const record = { ...verification, lesson: lessons.get(example.id) ?? null, replay, generatedAt: new Date().toISOString() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `regra-browser-demo-${example.id}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const sdkExample = `import { createRegra } from '@mahekara28/regra';

const regra = createRegra({ project: 'my-app' });
const proof = await regra.verify({
  spec: {
    entry: 'average', title: 'Empty input returns zero',
    repro: { name: 'Empty', args: [[]], expect: 0 },
    checks: [{ name: 'Numbers', args: [[2, 4]], expect: 3 }]
  },
  before: 'function average(xs) { return xs.reduce((a,b) => a+b) / xs.length; }',
  after: 'function average(xs) { return xs.length ? xs.reduce((a,b) => a+b, 0) / xs.length : 0; }'
});

console.log(proof.status);
// Only a verified repair creates a retained lesson.`;

let installMode = 'agent';
let agent = 'cursor';
const configs = { cursor: '.cursor/mcp.json', claude: '.mcp.json', codex: '.codex/config.toml', vscode: '.vscode/mcp.json' };

function renderInstall() {
  const library = installMode === 'library';
  const app = installMode === 'app';
  const repository = installMode === 'repository';
  document.querySelectorAll('[data-install]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.install === installMode)));
  document.querySelectorAll('[data-agent]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.agent === agent)));
  byId('install-step-title').textContent = library ? 'Add the dependency' : 'Install the package';
  byId('install-step-description').textContent = library ? 'Run this inside an existing Node project. The dependency installs from GitHub.' : 'Install from the GitHub repository. A release on the npm registry is pending.';
  byId('install-command').textContent = library ? 'npm install --save-dev github:mahekara28/regra' : 'npm install --global github:mahekara28/regra';
  byId('clone-option').hidden = library;
  byId('setup-title').textContent = library ? 'Verify a repair' : 'Configure your project';
  byId('setup-description').textContent = library ? 'Save this as check-regra.mjs in your project. It records the verified result in the local .regra folder.' : 'Open a terminal in an existing project folder. The dot means “this folder”; --demo adds a sample case.';
  byId('agent-picker').hidden = installMode !== 'agent';
  byId('setup-command').textContent = library ? sdkExample : app ? 'regra init --root . --demo\nregra demo --root .\nregra ui --root .' : `regra init --root . --demo\nregra connect --client ${agent} --root .\nregra doctor --root .`;
  byId('setup-note').textContent = library ? 'Run with: node check-regra.mjs. TypeScript declarations are included in the package.' : app ? 'The demo uses the real verification engine. Open the local address printed by regra ui.' : `Adds REGRA to ${configs[agent]}. Doctor checks the local MCP server.`;
  byId('next-title').textContent = library ? 'Use the result' : app ? 'Open the local dashboard' : 'Restart your agent';
  byId('next-description').textContent = library ? 'Use proof.status to decide whether to accept a proposed repair. Retrieve lessons with regra.context() and replay them with regra.check().' : app ? 'Inspect the source and results in Workbench, Lessons and Evidence. Connections helps you configure an agent.' : 'Open the project, accept the normal MCP trust prompt and try this request:';
  byId('agent-prompt-box').hidden = installMode !== 'agent';
  byId('install-final-note').textContent = library ? 'Imports start no server. See the API reference below for the full verification and replay contract.' : app ? 'Stop the local server with Ctrl+C. Saved evidence stays in the project’s .regra folder.' : 'The agent starts REGRA over stdio. A dashboard server or REGRA API key is not required.';
  if (repository) {
    byId('setup-title').textContent = 'Inspect and preview';
    byId('setup-description').textContent = 'Open a terminal in your existing Git project. Replace main with the broken revision and HEAD with the committed fix.';
    byId('setup-command').textContent = 'regra inspect --root .\nregra repo-verify --root . --baseline main --candidate HEAD --dry-run';
    byId('setup-note').textContent = 'These commands are read-only. The preview shows exact revisions, discovered tests and any blockers.';
    byId('next-title').textContent = 'Review, then verify';
    byId('next-description').textContent = 'After reviewing your trusted project and test plan, replace --dry-run with --trusted to execute. Read the proof ID printed by REGRA with regra repo-evidence --id YOUR_PROOF_ID.';
    byId('install-final-note').textContent = 'Runs committed node --test projects. Repository snapshots are not a security sandbox; only execute code you trust.';
  }
}
document.querySelectorAll('[data-install]').forEach(button => button.addEventListener('click', () => {
  installMode = button.dataset.install;
  renderInstall();
}));
document.querySelectorAll('[data-agent]').forEach(button => button.addEventListener('click', () => {
  agent = button.dataset.agent;
  renderInstall();
}));
document.querySelectorAll('[data-open-install]').forEach(link => link.addEventListener('click', () => {
  installMode = link.dataset.openInstall;
  renderInstall();
}));

let copyTimer;
const copyButtonTimers = new WeakMap();
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const source = byId(button.dataset.copy);
  try {
    await navigator.clipboard.writeText(source.textContent);
    byId('copy-announcement').textContent = 'Copied to clipboard.';
    button.dataset.copyLabel ||= button.textContent;
    clearTimeout(copyButtonTimers.get(button));
    button.textContent = 'Copied';
    copyButtonTimers.set(button, setTimeout(() => { button.textContent = button.dataset.copyLabel; }, 1600));
  } catch {
    const range = document.createRange();
    range.selectNodeContents(source);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    byId('copy-announcement').textContent = 'Clipboard access is blocked. Text selected—press Ctrl+C (⌘C on Mac) to copy.';
  }
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => { byId('copy-announcement').textContent = ''; }, 6000);
}));

selectExample();
renderInstall();
byId('run-demo').disabled = false;
// Display a real initial execution of the prepared example, using the same check as the button.
runDemo();
