export function showSection(name) {
  document.querySelectorAll('.tool-section').forEach((section) => {
    section.hidden = section.id !== name;
  });
  const selected = name === 'library-reader' ? 'library' : name;
  document.querySelectorAll('[data-section]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.section === selected),
    );
  });
}
export function initializeNavigation() {
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-section]');
    if (tab) showSection(tab.dataset.section);
  });
}
