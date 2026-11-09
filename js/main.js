(() => {
  const modules = window.studyModules || [];
  document.querySelectorAll('[data-module-grid]').forEach((grid) => {
    grid.innerHTML = modules
      .map(
        (
          item,
        ) => `<article class="module-card" style="--cover:${item.color};--wash:${item.wash}">
      <div class="book-stage" aria-hidden="true"><div class="book"><small>Método Judicial · 2026</small><strong>${item.title}</strong><span>MÓDULO 0${item.id} / MENDOZA</span></div></div>
      <span class="module-number">Módulo 0${item.id}</span><h3>${item.title}</h3><p>Libro · Resumen · Cuadro · Esquema</p>
      <button class="module-open" data-module="${item.id}" aria-label="Ver contenido previsto de ${item.title}">Explorar módulo</button></article>`,
      )
      .join('');
  });
  document.querySelectorAll('[data-locked-modules]').forEach((list) => {
    list.innerHTML = modules
      .map(
        (item) =>
          `<div class="locked-tile"><div><h3>0${item.id} · ${item.title}</h3><p>Biblioteca de estudio + examen de 20 preguntas</p></div><span class="lock-label">Acceso privado</span></div>`,
      )
      .join('');
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-module]');
    if (!button) return;
    const item = modules.find(
      (item) => item.id === Number(button.dataset.module),
    );
    if (!item) return;
    document.getElementById('module-title').textContent = item.title;
    document.getElementById('module-description').textContent =
      item.description;
    document.getElementById('module-label').textContent =
      `Módulo 0${item.id} · Biblioteca prevista`;
    document.getElementById('module-pages').textContent =
      `${item.pages} páginas · fuente recibida`;
    window.openStudyDialog('module-dialog');
  });
  // One short entrance per section; content stays visible without JS or motion.
  const motionPreference = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  if ('IntersectionObserver' in window && !motionPreference.matches) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('reveal-in');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12 },
    );
    document
      .querySelectorAll(
        '.section-heading, .method-head, .journey, .access-card, .stage-card',
      )
      .forEach((section) => observer.observe(section));
    motionPreference.addEventListener('change', (event) => {
      if (event.matches) {
        observer.disconnect();
        document
          .querySelectorAll('.reveal-in')
          .forEach((section) => section.classList.remove('reveal-in'));
      }
    });
  }
})();
