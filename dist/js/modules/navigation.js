(() => {
  const button = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav-links');
  if (!button || !nav) return;
  const mobile = window.matchMedia('(max-width: 820px)');
  const reset = () => {
    nav.dataset.collapsed = String(mobile.matches);
    button.setAttribute('aria-expanded', String(!mobile.matches));
  };
  reset();
  mobile.addEventListener('change', reset);
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    nav.dataset.collapsed = String(!open);
  });
  nav.addEventListener('click', (event) => {
    if (mobile.matches && event.target.closest('a')) reset();
  });
})();
