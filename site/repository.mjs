// Progressive enhancement: all four steps remain readable without JavaScript.
const buttons = [...document.querySelectorAll('[data-repo-step]')];
const panels = [...document.querySelectorAll('.workflow-panel')];

function selectStep(button) {
  const selected = button.getAttribute('aria-controls');
  for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
  for (const panel of panels) panel.hidden = panel.id !== selected;
}

if (buttons.length) {
  document.querySelector('.workflow-picker').hidden = false;
  document.querySelector('.repo-workflow').classList.add('is-interactive');
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => selectStep(button));
    button.addEventListener('keydown', event => {
      const offsets = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      let next;
      if (event.key in offsets) next = (index + offsets[event.key] + buttons.length) % buttons.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[next].focus();
      selectStep(buttons[next]);
    });
  });
  selectStep(buttons[0]);
}
