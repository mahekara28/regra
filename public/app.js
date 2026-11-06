'use strict';
const $ = selector => document.querySelector(selector);
let state = { lessons: [], runs: [], examples: [] };
let example = null, activeView = 'workbench', currentRun = null, busy = false, revision = 0, modelListing = null;
let connectionInfo = null;
let folderCheckRevision = 0;
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
function invalidate() { revision++; currentRun = null; $('#result').hidden = true; $('#draft-label').textContent = 'unverified draft'; }
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
  $('#case-description').textContent = custom ? 'Your own function: update the project, behavior, test cases, and both versions below. Keep the same project key and function name to reuse lessons.' : item.description;
  $('#args-help').textContent = `For ${item.spec.entry}(${item.spec.repro.args.map(a => JSON.stringify(a)).join(', ')}), enter ${JSON.stringify(item.spec.repro.args)}.`;
  $('#expect-help').textContent = !custom && item.id === 'empty-average' ? 'The demo chooses 0 for an empty average; your app may need another rule.' : 'Choose the behavior your app needs. JSON strings must use double quotes.';
  $('#good-fix').disabled = custom; $('#bad-fix').disabled = custom;
  document.querySelectorAll('.example-button').forEach(button => { button.classList.toggle('selected', !custom && button.dataset.example === item.id); button.setAttribute('aria-pressed', String(!custom && button.dataset.example === item.id)); });
  $('#ai-note').textContent = 'Manual edits and the example fixes work without an AI model.';
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
  $('#suggest').disabled = value || !$('#model').value;
  $('#verify').innerHTML = value && kind === 'verify' ? 'Running the evidence checks…' : 'Verify this fix <span aria-hidden="true">→</span>';
  $('#suggest').textContent = value && kind === 'ai' ? 'Drafting locally…' : 'Ask local AI ✦';
}
function renderSummary() {
  $('#metric-verified').textContent = state.runs.filter(r => r.status === 'verified').length;
  $('#metric-rejected').textContent = state.runs.filter(r => r.status === 'rejected').length;
  $('#metric-lessons').textContent = state.lessons.length; $('#nav-count').textContent = state.lessons.length;
  renderLessons(); renderHistory();
}
function outcome(result) {
  if (!result.valid) return '<span class="fail-text">Could not run</span>';
  if (!result.stable) return `<span class="fail-text">Unstable ${result.passes}/${result.repeats}</span>`;
  return `<span class="${result.passed ? 'pass-text' : 'fail-text'}">${result.passed ? 'Pass' : 'Fail'} · ${result.passes}/${result.repeats}</span>`;
}
function renderRun(run, target) {
  const heading = { verified: 'Verified. Lesson retained.', rejected: 'Rejected. The fix needs more work.', inconclusive: 'Inconclusive. Review the evidence.' }[run.status];
  target.className = `result ${run.status}`;
  target.innerHTML = `<div class="result-top"><div><span class="result-badge">${esc(run.status.toUpperCase())} / ${esc(run.spec.project)}</span><h2>${heading}</h2><p>${esc(run.summary)}</p></div><button class="text-button download-proof">Download proof ↗</button></div>
    <div class="gates">${run.gates.map(g => `<div class="gate ${g.passed ? '' : 'fail'}"><b>${g.passed ? '✓ PASS' : '× FAIL'}</b><strong>${esc(g.name)}</strong><p>${esc(g.detail)}</p></div>`).join('')}</div>
    <div class="table-wrap"><table><thead><tr><th>Recorded behavior</th><th>Original</th><th>Proposed fix</th></tr></thead><tbody>${run.afterResults.map((r, i) => `<tr><td>${esc(r.name)} ${r.id.startsWith('memory-') ? '<span class="pill">saved lesson</span>' : ''}</td><td>${outcome(run.beforeResults[i])}</td><td>${outcome(r)}</td></tr>`).join('')}</tbody></table></div>
    <div class="result-meta"><span>${run.afterResults.length} distinct tests · 3 runs per version · ${esc(run.runtime)} · ${esc(time(run.createdAt))}<br>Evidence covers these cases only. Review expected behavior and the code before using a fix.</span><button class="text-button download-case">Download test case ↗</button></div>
    <details class="observations"><summary>Inspect outputs and code fingerprints</summary><pre>${esc(JSON.stringify({ beforeHash: run.beforeHash, afterHash: run.afterHash, original: run.beforeResults, proposed: run.afterResults }, null, 2))}</pre></details>`;
  target.querySelector('.download-proof').onclick = () => download(`regra-proof-${run.id.slice(0, 8)}.json`, run);
  target.querySelector('.download-case').onclick = () => download(`${run.spec.entry}.case.json`, run.spec);
  target.hidden = false;
}
function renderLessons() {
  const query = $('#search').value.toLowerCase();
  const lessons = state.lessons.filter(l => `${l.project} ${l.entry} ${l.title}`.toLowerCase().includes(query));
  if (!lessons.length) {
    $('#lesson-list').innerHTML = `<div class="empty"><div class="empty-icon">▤</div><h3>${query ? 'No matching lessons' : 'Your first lesson is one fix away.'}</h3><p>${query ? 'Try another project, function, or phrase.' : 'A lesson appears here after the original failure and the proposed fix pass all verification gates.'}</p><button class="soft-button" data-view="workbench">Open the workbench →</button></div>`; return;
  }
  $('#lesson-list').innerHTML = [...lessons].reverse().map(l => `<article class="panel lesson-card"><div class="lesson-head"><div><span class="eyebrow">${esc(l.project)} / ${esc(l.entry)}</span><h3>${esc(l.title)}</h3><p>Retained ${esc(time(l.createdAt))} · ${l.checks.length + 1} recorded behaviors · ${esc(l.runtime)}</p></div><span class="pill">VERIFIED LESSON</span></div><details><summary>See the executable behavior contract</summary><pre>${esc(JSON.stringify([l.repro, ...l.checks], null, 2))}</pre><button class="text-button export-case" data-lesson="${esc(l.id)}">Download test case ↗</button></details></article>`).join('');
}
function renderHistory() {
  $('#history-list').innerHTML = state.runs.length ? [...state.runs].reverse().map(r => `<button class="history-row" data-run="${esc(r.id)}"><span><strong>${esc(r.spec.title)}</strong><small>${esc(r.spec.project)} · ${esc(time(r.createdAt))}</small></span><span class="history-status ${r.status}">${esc(r.status.toUpperCase())} ↗</span></button>`).join('') : '<div class="empty"><div class="empty-icon">↺</div><h3>No runs yet.</h3><p>Verify a fix in the workbench to start an evidence trail.</p><button class="soft-button" data-view="workbench">Try the guided example →</button></div>';
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
    $('#connection-status').innerHTML = connectionInfo.setupMessage ? `<p class="connection-note">This dashboard project: ${esc(connectionInfo.setupMessage)}</p>` : `<p class="connection-note">Configuration status for ${esc(connectionInfo.root)}</p><div class="connection-badges">${connectionInfo.configured.map(c => `<span class="pill">${esc(c.label)}: ${esc(c.status)}</span>`).join('')}</div>`;
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
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view]'); if (nav) switchView(nav.dataset.view);
  const exampleButton = event.target.closest('[data-example]'); if (exampleButton && !busy) loadExample(state.examples.find(e => e.id === exampleButton.dataset.example));
  const historyButton = event.target.closest('[data-run]'); if (historyButton) { renderRun(state.runs.find(r => r.id === historyButton.dataset.run), $('#history-result')); $('#history-result').scrollIntoView({ block: 'start', behavior: 'instant' }); }
  const exportButton = event.target.closest('[data-lesson]'); if (exportButton) { const l = state.lessons.find(l => l.id === exportButton.dataset.lesson); download(`${l.entry}.case.json`, { project: l.project, entry: l.entry, title: l.title, repro: l.repro, checks: l.checks }); }
});
window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));
fields.forEach(id => $(`#${id}`).addEventListener('input', () => { invalidate(); if (id === 'entry' || id === 'args') $('#args-help').textContent = 'Put each argument inside an outer JSON array. One list argument needs two sets of brackets.'; if (id === 'checks') { try { const checks = JSON.parse($('#checks').value); $('#checks-count').textContent = `${checks.length} checks`; } catch { $('#checks-count').textContent = 'Needs valid JSON'; } } }));
$('#custom').onclick = () => { loadExample(state.examples[0], true); $('#project').focus(); };
$('#good-fix').onclick = () => { invalidate(); $('#after').value = example.after; $('#ai-note').textContent = 'Example fix loaded. This is a prepared teaching example, not an AI-generated suggestion. Verify it to get evidence.'; };
$('#bad-fix').onclick = () => { invalidate(); $('#after').value = example.bad; $('#ai-note').textContent = 'This prepared fix removes the immediate failure but changes other behavior. Run verification to see which checks catch it.'; };
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
    $('#draft-label').textContent = 'unverified AI draft';
    $('#ai-note').textContent = `${draft.model}: ${draft.explanation}\nThis is a draft. Review it, then verify.`;
  } catch (error) { notice(error.message); $('#ai-note').textContent = 'The local AI draft did not complete. You can still load an example fix or edit the code.'; }
  finally { setBusy(false); }
};
async function boot() {
  try {
    state = await api('/api/state');
    $('#example-options').innerHTML = state.examples.map(e => `<button class="example-button" data-example="${esc(e.id)}" aria-pressed="false"><span class="radio" aria-hidden="true"></span>${esc(e.label)}</button>`).join('');
    renderSummary(); loadExample(state.examples[0]); switchView(location.hash.slice(1) || 'workbench');
    modelListing = await api('/api/models');
    $('#model').innerHTML = modelListing.models.length ? modelListing.models.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('') : '<option value="">No local model available</option>';
    const small = modelListing.models.find(m => /qwen2\.5:1\.5b/.test(m.name)); if (small) $('#model').value = small.name;
    $('#suggest').disabled = !modelListing.models.length;
    if (!modelListing.available) $('#ai-note').textContent = modelListing.message;
  } catch (error) { notice(`Could not connect to REGRA. Keep the server terminal open, then refresh. ${error.message}`); }
}
boot();
