'use strict';
const $ = selector => document.querySelector(selector);
let state = { lessons: [], runs: [], examples: [] };
let example = null, activeView = 'workbench', currentRun = null, busy = false, revision = 0, modelListing = null;
let connectionInfo = null;
let folderCheckRevision = 0;
let historyFilter = 'all', selectedHistoryId = null;
const fields = ['project', 'entry', 'title', 'args', 'expect', 'expect-mode', 'checks', 'before', 'after'];
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const time = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
function notice(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
async function api(route, data) {
  const response = await fetch(route, data ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Regra-Token': state.token }, body: JSON.stringify(data) } : {});
  let value;
  try { value = await response.json(); } catch { throw new Error('The local service returned an unreadable response.'); }
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status}).`);
  return value;
}
function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function switchView(view) {
  if (!['workbench', 'lessons', 'history', 'connections', 'guide'].includes(view)) view = 'workbench';
  activeView = view;
  document.querySelectorAll('.view').forEach(item => { item.hidden = item.id !== `view-${view}`; });
  document.querySelectorAll('.nav').forEach(item => { item.classList.toggle('active', item.dataset.view === view); item.setAttribute('aria-current', item.dataset.view === view ? 'page' : 'false'); });
  $('#page-name').textContent = { workbench: 'Workbench', lessons: 'Lesson library', history: 'Run history', connections: 'Connections', guide: 'Field guide' }[view];
  if (view === 'connections' && !connectionInfo) loadConnections();
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function invalidate() {
  revision++; currentRun = null; $('#result').hidden = true;
  $('#evidence-placeholder').hidden = false;
  $('#draft-label').textContent = 'unverified draft';
  $('#good-fix').setAttribute('aria-pressed', 'false');
  $('#bad-fix').setAttribute('aria-pressed', 'false');
}
function syncEditor(id) {
  const editor = $(`#${id}`);
  const lines = editor.value.split('\n').length;
  $(`#${id}-lines`).textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  $(`#${id}-line-count`).textContent = `${lines} ${lines === 1 ? 'LINE' : 'LINES'}`;
  $(`#${id}-lines`).scrollTop = editor.scrollTop;
}
function renderChecksPreview() {
  try {
    const checks = JSON.parse($('#checks').value);
    if (!Array.isArray(checks)) throw new Error();
    $('#checks-count').textContent = `${checks.length} checks`;
    $('#checks-preview').innerHTML = checks.slice(0, 20).map(c => {
      if (!c || typeof c !== 'object') throw new Error();
      const expected = Object.hasOwn(c, 'throws') ? `throws ${c.throws}` : JSON.stringify(c.expect) ?? 'missing expectation';
      return `<div class="preview-check"><span>${esc(c.name || 'Unnamed check')}</span><code title="${esc(expected)}">${esc(expected.length > 24 ? expected.slice(0, 23) + '…' : expected)}</code></div>`;
    }).join('') + (checks.length > 20 ? '<p class="connection-note">More checks are available in the JSON editor.</p>' : '');
  } catch {
    $('#checks-count').textContent = 'Needs valid JSON';
    $('#checks-preview').textContent = 'Open the test editor to correct these cases.';
  }
}
function loadExample(item, custom = false) {
  example = custom ? null : item; invalidate(); notice('');
  $('#project').value = custom ? 'my-project' : item.spec.project;
  $('#entry').value = item.spec.entry; $('#title').value = item.spec.title;
  $('#args').value = JSON.stringify(item.spec.repro.args);
  $('#expect-mode').value = Object.hasOwn(item.spec.repro, 'throws') ? 'throws' : 'expect';
  $('#expect').value = Object.hasOwn(item.spec.repro, 'throws') ? item.spec.repro.throws : JSON.stringify(item.spec.repro.expect);
  $('#checks').value = JSON.stringify(item.spec.checks, null, 2);
  $('#checks-count').textContent = `${item.spec.checks.length} checks`;
  $('#before').value = item.before; $('#after').value = item.before;
  syncEditor('before'); syncEditor('after'); renderChecksPreview();
  $('#case-description').textContent = custom ? 'Your own function: update the project, behavior, test cases, and both versions below. Keep the same project key and function name to reuse lessons.' : item.description;
  $('#args-help').textContent = `For ${item.spec.entry}(${item.spec.repro.args.map(a => JSON.stringify(a)).join(', ')}), enter ${JSON.stringify(item.spec.repro.args)}.`;
  $('#expect-help').textContent = !custom && item.id === 'empty-average' ? 'The demo chooses 0 for an empty average; your app may need another rule.' : 'Choose the behavior your app needs. JSON strings must use double quotes.';
  $('#good-fix').disabled = custom; $('#bad-fix').disabled = custom;
  document.querySelectorAll('.example-button').forEach(button => { button.classList.toggle('selected', !custom && button.dataset.example === item.id); button.setAttribute('aria-pressed', String(!custom && button.dataset.example === item.id)); });
  $('#ai-note').textContent = 'Manual edits and the example fixes work without an AI model.';
  $('#candidate-note').textContent = custom ? 'Paste the original and proposed function. Review the contract before verifying.' : 'Start with the incomplete fix. See why stopping a crash isn’t enough.';
}
function parse(value, label) { try { return JSON.parse(value); } catch { throw new Error(`${label} is not valid JSON. Strings need double quotes; lists need square brackets.`); } }
function requestData() {
  const mode = $('#expect-mode').value;
  const checks = parse($('#checks').value, 'Existing-behavior tests');
  return {
    spec: { project: $('#project').value.trim(), entry: $('#entry').value.trim(), title: $('#title').value.trim(), repro: { name: $('#title').value.trim(), args: parse($('#args').value, 'Function arguments'), ...(mode === 'throws' ? { throws: $('#expect').value.trim() } : { expect: parse($('#expect').value, 'Expected result') }) }, checks },
    before: $('#before').value, after: $('#after').value
  };
}
function setBusy(value, kind = 'verify') {
  busy = value;
  for (const id of fields) $(`#${id}`).disabled = value;
  $('#verify').disabled = value; $('#custom').disabled = value;
  $('#good-fix').disabled = value || !example; $('#bad-fix').disabled = value || !example;
  document.querySelectorAll('.example-button').forEach(button => { button.disabled = value; });
  $('#model').disabled = value;
  $('#reset-draft').disabled = value;
  $('#suggest').disabled = value || !$('#model').value;
  $('#verify').innerHTML = value && kind === 'verify' ? 'Running checks…' : 'Verify this fix <span aria-hidden="true">↗</span>';
  $('#verify').setAttribute('aria-busy', String(value && kind === 'verify'));
  $('#suggest').textContent = value && kind === 'ai' ? 'Drafting locally…' : 'Draft a repair';
  $('.waiting-label').textContent = value && kind === 'verify' ? 'RUNNING CHECKS' : 'AWAITING A RUN';
}
function renderSummary() {
  $('#metric-verified').textContent = state.runs.filter(r => r.status === 'verified').length;
  $('#metric-rejected').textContent = state.runs.filter(r => r.status === 'rejected').length;
  $('#metric-lessons').textContent = state.lessons.length; $('#nav-count').textContent = state.lessons.length;
  $('#app-version').textContent = `v${state.version || '0.2'}`;
  renderLessons(); renderHistory();
}
function outcome(result) {
  if (!result.valid) return '<span class="fail-text">Could not run</span>';
  if (!result.stable) return `<span class="fail-text">Unstable ${result.passes}/${result.repeats}</span>`;
  const observed = result.observations[0];
  const value = observed.kind === 'throw' ? `throws ${observed.name}` : JSON.stringify(observed.value);
  return `<span class="${result.passed ? 'pass-text' : 'fail-text'}">${result.passed ? 'Pass' : 'Fail'} · ${result.passes}/${result.repeats}</span><small class="observed-value" title="${esc(String(value).slice(0, 250))}">Run 1: ${esc(String(value).slice(0, 48))}${String(value).length > 48 ? '…' : ''}</small>`;
}
function expectedLabel(test) { return Object.hasOwn(test, 'throws') ? `throws ${test.throws}` : JSON.stringify(test.expect); }
function renderRun(run, target) {
  const heading = { verified: 'Verified for these cases.', rejected: 'This repair did not pass.', inconclusive: 'This run needs review.' }[run.status];
  target.className = `result ${run.status}`;
  target.innerHTML = `<div class="result-top"><div><span class="result-badge">${esc(run.status.toUpperCase())} / ${esc(run.spec.project)}</span><h2>${heading}</h2><p>${esc(run.summary)}</p></div><button class="text-button download-proof">Download proof ↗</button></div>
    <div class="table-wrap"><table><thead><tr><th>Recorded behavior</th><th>Original</th><th>Proposed fix</th></tr></thead><tbody>${run.afterResults.map((r, i) => `<tr><td>${esc(r.name)} ${r.id.startsWith('memory-') ? '<span class="pill">saved lesson</span>' : ''}<small class="expected-value">Expected: ${esc(String(expectedLabel(r)).slice(0, 60))}${String(expectedLabel(r)).length > 60 ? '…' : ''}</small></td><td>${outcome(run.beforeResults[i])}</td><td>${outcome(r)}</td></tr>`).join('')}</tbody></table></div>
    <details class="gates-details" ${run.status === 'verified' ? '' : 'open'}><summary>Decision checks <span>${run.gates.filter(g => g.passed).length} / ${run.gates.length} passed</span></summary><div class="gates">${run.gates.map(g => `<div class="gate ${g.passed ? '' : 'fail'}"><b>${g.passed ? '✓ PASS' : '× FAIL'}</b><strong>${esc(g.name)}</strong><p>${esc(g.detail)}</p></div>`).join('')}</div></details>
    <div class="result-meta"><span>${run.afterResults.length} distinct tests · 3 runs per version · ${esc(run.runtime)} · ${esc(time(run.createdAt))}<br>Evidence covers these cases only. Review expected behavior and the code before using a fix.</span><button class="text-button download-case">Download test case ↗</button></div>
    <details class="observations"><summary>Inspect outputs and code fingerprints</summary><div class="proof-id">PROOF / ${esc(run.id)}</div><pre>${esc(JSON.stringify({ beforeHash: run.beforeHash, afterHash: run.afterHash, original: run.beforeResults, proposed: run.afterResults }, null, 2))}</pre></details>`;
  target.querySelector('.download-proof').onclick = () => download(`regra-proof-${run.id.slice(0, 8)}.json`, run);
  target.querySelector('.download-case').onclick = () => download(`${run.spec.entry}.case.json`, run.spec);
  target.hidden = false;
  if (target.id === 'result') $('#evidence-placeholder').hidden = true;
}
function renderLessons() {
  const query = $('#search').value.toLowerCase();
  const lessons = state.lessons.filter(l => `${l.project} ${l.entry} ${l.title}`.toLowerCase().includes(query));
  $('#lesson-total').textContent = `${lessons.length} ${query ? 'matching' : 'retained'} ${lessons.length === 1 ? 'lesson' : 'lessons'}`;
  if (!lessons.length) {
    $('#lesson-list').innerHTML = `<div class="empty"><div class="empty-icon" aria-hidden="true">[ ]</div><h3>${query ? 'No matching lessons' : 'No lessons retained yet.'}</h3><p>${query ? 'Try another project, function, or phrase.' : 'Verify a repair in the workbench. When all gates pass, its behavior becomes a check you can run again.'}</p><button class="soft-button" data-view="workbench">Open the workbench ↗</button></div>`; return;
  }
  $('#lesson-list').innerHTML = [...lessons].reverse().map((l, i) => `<article class="lesson-card"><div class="lesson-head"><span class="lesson-index">${String(i + 1).padStart(2, '0')}</span><div><span class="eyebrow">${esc(l.project)} / ${esc(l.entry)}</span><h3>${esc(l.title)}</h3><p>${l.checks.length + 1} recorded behaviors · ${esc(time(l.createdAt))} · ${esc(l.runtime)}</p></div><span class="lesson-badge"><i class="status-dot"></i>RETAINED</span></div><details><summary>Inspect the behavior contract</summary><pre>${esc(JSON.stringify([l.repro, ...l.checks], null, 2))}</pre><button class="text-button export-case" data-lesson="${esc(l.id)}">Download test case ↗</button>${state.runs.some(r => r.id === l.evidenceRun) ? `<button class="text-button lesson-proof" data-proof="${esc(l.evidenceRun)}">View original proof ↗</button>` : ''}</details></article>`).join('');
}
function renderHistory() {
  const runs = state.runs.filter(r => historyFilter === 'all' || r.status === historyFilter);
  $('#history-total').textContent = `${runs.length} ${runs.length === 1 ? 'run' : 'runs'}`;
  document.querySelectorAll('[data-status]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.status === historyFilter)));
  $('#history-list').innerHTML = runs.length ? [...runs].reverse().map(r => `<button class="history-row" data-run="${esc(r.id)}" aria-pressed="${r.id === selectedHistoryId}"><span class="history-status ${esc(r.status)}">${esc(r.status)}</span><span><strong>${esc(r.spec.title)}</strong><small>${esc(r.spec.project)} / ${esc(r.spec.entry)} · ${esc(time(r.createdAt))}</small></span><span class="history-hashes">${esc(r.beforeHash.slice(0, 7))} → ${esc(r.afterHash.slice(0, 7))}</span><span class="history-arrow" aria-hidden="true">↗</span></button>`).join('') : `<div class="empty"><div class="empty-icon" aria-hidden="true">—</div><h3>${state.runs.length ? 'No runs with this decision.' : 'No runs yet.'}</h3><p>${state.runs.length ? 'Choose another filter to inspect the register.' : 'Verify a fix in the workbench to record your first evidence.'}</p><button class="soft-button" data-view="workbench">Open the workbench ↗</button></div>`;
}
function renderConnectionCommands() {
  if (!connectionInfo) return;
  const powershell = $('#connection-shell').value === 'powershell';
  const quote = value => powershell ? "'" + value.replaceAll("'", "''") + "'" : "'" + value.replaceAll("'", "'\\''") + "'";
  const root = $('#connection-root').value.trim();
  const cli = `node ${quote(connectionInfo.cli)}`;
  const client = $('#connection-client').value;
  $('#connection-commands').textContent = `${cli} init --root ${quote(root)}\n\n${cli} connect --client ${client} --root ${quote(root)}\n\n${cli} doctor --root ${quote(root)}`;
  const info = connectionInfo.clients.find(c => c.id === client);
  $('#connection-note').textContent = `${info.label} uses ${info.file}. These commands configure the selected folder. To add the teaching case during initialization, add --demo to the first command.`;
  if (!root) $('#connection-commands').textContent = 'Choose an existing project folder above to generate commands.';
}
async function checkConnectionFolder() {
  const revision = ++folderCheckRevision;
  const input = $('#connection-root');
  const status = $('#connection-folder-status');
  status.textContent = 'Checking the folder…';
  try {
    const result = await api('/api/project-folder', { root: input.value.trim() });
    if (revision !== folderCheckRevision) return false;
    input.setAttribute('aria-invalid', 'false');
    status.textContent = result.message;
    return true;
  } catch (error) {
    if (revision !== folderCheckRevision) return false;
    input.setAttribute('aria-invalid', 'true');
    status.textContent = error.message;
    return false;
  }
}
async function loadConnections() {
  try {
    const selectedRoot = $('#connection-root').value;
    connectionInfo = await api('/api/connections');
    if (!selectedRoot) $('#connection-root').value = connectionInfo.root;
    renderConnectionCommands();
    $('#connection-status').innerHTML = connectionInfo.setupMessage ? `<p class="connection-note">This dashboard project: ${esc(connectionInfo.setupMessage)}</p>` : `<p class="connection-note">${esc(connectionInfo.root)}</p><div class="connection-badges">${connectionInfo.configured.map(c => `<span class="pill ${c.status === 'configured' ? 'configured' : ''}"><span>${esc(c.label)}</span><span>${esc(c.status.replaceAll('-', ' '))}</span></span>`).join('')}</div>`;
  } catch (error) { $('#connection-note').textContent = `Connection details could not load: ${error.message}. Restart REGRA after updating its source.`; }
}
$('#connection-client').onchange = renderConnectionCommands;
$('#connection-root').oninput = () => {
  folderCheckRevision++;
  $('#connection-root').removeAttribute('aria-invalid');
  $('#connection-folder-status').textContent = 'Select a folder that already exists on this computer. Check it before running setup.';
  renderConnectionCommands();
};
$('#check-connection-folder').onclick = checkConnectionFolder;
$('#connection-shell').onchange = renderConnectionCommands;
$('#refresh-connections').onclick = loadConnections;
$('#copy-connection').onclick = async () => {
  if (!await checkConnectionFolder()) return;
  try { await navigator.clipboard.writeText($('#connection-commands').textContent); $('#copy-connection').textContent = 'Copied'; setTimeout(() => { $('#copy-connection').textContent = 'Copy commands'; }, 1800); }
  catch { notice('Clipboard access was unavailable. Select the commands and copy them manually.'); }
};
$('#copy-agent-prompt').onclick = async () => {
  try { await navigator.clipboard.writeText($('#agent-prompt').textContent); $('#copy-agent-prompt').textContent = 'Prompt copied'; setTimeout(() => { $('#copy-agent-prompt').textContent = 'Copy agent prompt ↗'; }, 1800); }
  catch { notice('Clipboard access was unavailable. Select the prompt and copy it manually.'); }
};
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view]'); if (nav) switchView(nav.dataset.view);
  const exampleButton = event.target.closest('[data-example]'); if (exampleButton && !busy) loadExample(state.examples.find(e => e.id === exampleButton.dataset.example));
  const historyButton = event.target.closest('[data-run]'); if (historyButton) { selectedHistoryId = historyButton.dataset.run; renderRun(state.runs.find(r => r.id === selectedHistoryId), $('#history-result')); renderHistory(); $('#history-result').scrollIntoView({ block: 'start', behavior: 'instant' }); }
  const filter = event.target.closest('[data-status]'); if (filter) { historyFilter = filter.dataset.status; selectedHistoryId = null; $('#history-result').hidden = true; renderHistory(); }
  const proof = event.target.closest('[data-proof]'); if (proof) { selectedHistoryId = proof.dataset.proof; historyFilter = 'all'; switchView('history'); renderHistory(); renderRun(state.runs.find(r => r.id === selectedHistoryId), $('#history-result')); $('#history-result').scrollIntoView({ block: 'start', behavior: 'instant' }); }
  const exportButton = event.target.closest('[data-lesson]'); if (exportButton) { const l = state.lessons.find(l => l.id === exportButton.dataset.lesson); download(`${l.entry}.case.json`, { project: l.project, entry: l.entry, title: l.title, repro: l.repro, checks: l.checks }); }
});
window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));
fields.forEach(id => $(`#${id}`).addEventListener('input', () => { invalidate(); if (id === 'entry' || id === 'args') $('#args-help').textContent = 'Put each argument inside an outer JSON array. One list argument needs two sets of brackets.'; if (id === 'checks') renderChecksPreview(); if (id === 'before' || id === 'after') syncEditor(id); if (id === 'after') $('#candidate-note').textContent = 'Your edits are unverified. Run the checks against this version.'; }));
for (const id of ['before', 'after']) $(`#${id}`).addEventListener('scroll', () => { $(`#${id}-lines`).scrollTop = $(`#${id}`).scrollTop; });
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && activeView === 'workbench' && !busy) { event.preventDefault(); $('#verify').click(); } });
$('#custom').onclick = () => { loadExample(state.examples[0], true); $('#project').focus(); };
$('#good-fix').onclick = () => { invalidate(); $('#after').value = example.after; syncEditor('after'); $('#good-fix').setAttribute('aria-pressed', 'true'); $('#candidate-note').textContent = 'Prepared correct example loaded. Verify it against your contract.'; $('#ai-note').textContent = 'This is a prepared teaching example. No model was called.'; };
$('#bad-fix').onclick = () => { invalidate(); $('#after').value = example.bad; syncEditor('after'); $('#bad-fix').setAttribute('aria-pressed', 'true'); $('#candidate-note').textContent = 'This repair stops the immediate failure but breaks other behavior. Put it to the test.'; $('#ai-note').textContent = 'This is a prepared incomplete repair. No model was called.'; };
$('#reset-draft').onclick = () => { invalidate(); $('#after').value = $('#before').value; syncEditor('after'); $('#candidate-note').textContent = 'Candidate reset to the original. Load or write a repair before verifying.'; };
$('#model').onchange = () => { $('#suggest').disabled = busy || !$('#model').value; };
$('#search').oninput = renderLessons;
$('#export').onclick = () => download('regra-lessons.json', { version: 1, exportedAt: new Date().toISOString(), lessons: state.lessons });
$('#verify').onclick = async () => {
  let input;
  try { input = requestData(); } catch (error) { notice(error.message); return; }
  notice(''); setBusy(true); $('#result').hidden = true;
  try {
    currentRun = await api('/api/verify', input);
    renderRun(currentRun, $('#result'));
    $('#draft-label').textContent = currentRun.status === 'verified' ? 'verified for recorded cases' : 'needs review';
    try { state = await api('/api/state'); renderSummary(); } catch { notice('Verification completed, but history could not refresh. Reload to see the latest saved state.'); }
    $('#result').scrollIntoView({ block: 'start', behavior: 'instant' });
  } catch (error) { notice(error.message); }
  finally { setBusy(false); }
};
$('#suggest').onclick = async () => {
  let input;
  try { input = requestData(); } catch (error) { notice(error.message); return; }
  notice(''); setBusy(true, 'ai'); invalidate();
  $('#ai-note').textContent = 'Your selected local model is drafting a repair. This can take up to two minutes; nothing is accepted automatically.';
  try {
    const draft = await api('/api/suggest', { ...input, model: $('#model').value });
    $('#after').value = draft.code;
    syncEditor('after');
    $('#draft-label').textContent = 'unverified AI draft';
    $('#candidate-note').textContent = 'A local model proposed this repair. Review the code, then run the checks.';
    $('#ai-note').textContent = `${draft.model}: ${draft.explanation}\nThis is a draft. Review it, then verify.`;
  } catch (error) { notice(error.message); $('#ai-note').textContent = 'The local AI draft did not complete. You can still load an example fix or edit the code.'; }
  finally { setBusy(false); }
};
async function boot() {
  try {
    state = await api('/api/state');
    $('#example-options').innerHTML = state.examples.map((e, i) => `<button class="example-button" data-example="${esc(e.id)}" aria-pressed="false"><span class="case-number">${String(i + 1).padStart(2, '0')}</span><span><span class="case-name">${esc(e.label)}</span><span class="case-function">${esc(e.spec.entry)}()</span></span><span class="case-arrow" aria-hidden="true">↗</span></button>`).join('');
    renderSummary(); loadExample(state.examples[0]); switchView(location.hash.slice(1) || 'workbench');
    modelListing = await api('/api/models');
    $('#model').innerHTML = modelListing.models.length ? modelListing.models.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('') : '<option value="">No local model available</option>';
    const small = modelListing.models.find(m => /qwen2\.5:1\.5b/.test(m.name)); if (small) $('#model').value = small.name;
    $('#suggest').disabled = !modelListing.models.length;
    if (!modelListing.available) $('#ai-note').textContent = modelListing.message;
  } catch (error) { notice(`Could not connect to REGRA. Keep the server terminal open, then refresh. ${error.message}`); }
}
boot();
