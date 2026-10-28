/**
 * Gestor de Tema Oscuro y Claro — Método Judicial
 * Soporta persistencia en localStorage, sincronización inmediata para evitar FOUC,
 * y detección automática de preferencia del sistema.
 */
(() => {
  const THEME_KEY = 'mj_theme';

  function getPreferredTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const toggles = document.querySelectorAll('.theme-toggle-btn');
    toggles.forEach((btn) => {
      const isDark = theme === 'dark';
      btn.setAttribute('aria-pressed', String(isDark));
      btn.setAttribute('title', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      btn.innerHTML = isDark
        ? '<span class="theme-icon" aria-hidden="true">☀️</span><span class="theme-text">Modo Claro</span>'
        : '<span class="theme-icon" aria-hidden="true">🌙</span><span class="theme-text">Modo Oscuro</span>';
    });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    applyTheme(next);
  }

  // Inicializar inmediatamente
  const initial = getPreferredTheme();
  applyTheme(initial);

  // Vincular eventos cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyTheme(document.documentElement.getAttribute('data-theme') || initial);
    });
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.theme-toggle-btn');
    if (btn) {
      event.preventDefault();
      toggleTheme();
    }
  });

  // Escuchar cambios de preferencia del sistema si el usuario no ha forzado uno
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      try {
        if (!localStorage.getItem(THEME_KEY)) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      } catch {}
    });
  }

  window.__mjTheme = {
    get: () => document.documentElement.getAttribute('data-theme') || getPreferredTheme(),
    set: (t) => {
      try { localStorage.setItem(THEME_KEY, t); } catch {}
      applyTheme(t);
    },
    toggle: toggleTheme,
  };
})();
