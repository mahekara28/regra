// A small CSS scene driven by the same results displayed in the demo table.
const byId = id => document.getElementById(id);
const scene = byId('case-visual');
const stage = byId('scene-stage');
const stack = byId('case-stack');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let inView = true;
let frame = null;
let pointer = { x: 0, y: 0 };

function resetTilt() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  stack.style.removeProperty('--tilt-x');
  stack.style.removeProperty('--tilt-y');
}

function updateMotion() {
  const enabled = finePointer.matches && !reduced.matches && inView && !document.hidden;
  scene.dataset.motion = String(enabled);
  scene.dataset.visible = String(inView && !document.hidden);
  if (!enabled) resetTilt();
}

reduced.addEventListener('change', updateMotion);
finePointer.addEventListener('change', updateMotion);
document.addEventListener('visibilitychange', updateMotion);
const visibility = new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  updateMotion();
}, { threshold: 0 });
visibility.observe(scene);

stage.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || scene.dataset.motion !== 'true') return;
  const bounds = stage.getBoundingClientRect();
  pointer = { x: (event.clientX - bounds.left) / bounds.width - .5, y: (event.clientY - bounds.top) / bounds.height - .5 };
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    stack.style.setProperty('--tilt-x', (pointer.y * -9).toFixed(2) + 'deg');
    stack.style.setProperty('--tilt-y', (pointer.x * 9).toFixed(2) + 'deg');
    frame = null;
  });
}, { passive: true });
stage.addEventListener('pointerleave', resetTilt);
stage.addEventListener('pointercancel', resetTilt);
updateMotion();

function cells(id, cases, results) {
  byId(id).replaceChildren(...cases.map((test, index) => {
    const cell = document.createElement('span');
    cell.className = 'scene-cell';
    cell.dataset.result = results?.[index] ? results[index].passed ? 'pass' : 'fail' : 'waiting';
    cell.title = test.name;
    return cell;
  }));
}

function count(results, total) {
  return results ? results.filter(result => result.passed).length + ' / ' + total + ' cases pass' : total + ' cases to check';
}

export function updateScene({ example, candidate, verification, replay, lesson }) {
  const after = replay?.results ?? verification?.after;
  cells('scene-before', example.cases, verification?.before);
  cells('scene-after', example.cases, after);
  byId('scene-entry').textContent = example.entry + '()';
  byId('scene-before-result').textContent = count(verification?.before, example.cases.length);
  byId('scene-patch-result').textContent = count(after, example.cases.length);
  byId('scene-patch-label').textContent = replay ? 'Original replay' : candidate === 'correct' ? 'Patch B' : 'Patch A';
  byId('scene-memory').textContent = lesson ? lesson.cases.length + ' cases retained' : 'No lesson saved';
  scene.dataset.lesson = String(Boolean(lesson));
}
