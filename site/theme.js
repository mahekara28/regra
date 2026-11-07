// Resolve the theme before the stylesheet paints. Storage is optional.
(() => {
  const root = document.documentElement;
  const storageKey = 'regra-theme';
  const valid = value => value === 'light' || value === 'dark';
  let choice;
  try { choice = localStorage.getItem(storageKey); } catch { /* Private contexts may deny storage. */ }
  if (!valid(choice)) choice = null;

  function apply() {
    const theme = choice || 'dark';
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#000000' : '#f0f0e9';
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.hidden = false;
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.title = `Switch to ${theme === 'dark' ? 'day' : 'dark'} mode`;
      document.getElementById('theme-label').textContent = theme === 'dark' ? 'Night' : 'Day';
    }
  }

  apply();
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    choice = valid(event.newValue) ? event.newValue : null;
    apply();
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      choice = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(storageKey, choice); } catch { /* The current tab still works. */ }
      apply();
    });
  });
})();
