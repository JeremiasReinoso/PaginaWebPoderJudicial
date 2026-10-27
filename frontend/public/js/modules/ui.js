function configuredCampus() {
  const configured = window.METODO_JUDICIAL_CONFIG?.campusUrl?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
function localCampus() {
  return location.hostname === '127.0.0.1' || location.hostname === 'localhost';
}
window.openStudyDialog = (id) => {
  if (id === 'login-dialog') {
    const campus = configuredCampus();
    // Authenticate on the backend's own origin: codes never travel in URLs,
    // and no cross-site session cookie or permissive CORS is needed.
    if (campus && campus.origin !== location.origin) {
      window.location.assign(new URL('/ingreso', campus).href);
      return;
    }
    if (!campus && !localCampus()) {
      const message = document.getElementById('login-message');
      message.textContent =
        'El ingreso al campus todavía no está habilitado en este sitio.';
      document
        .querySelectorAll('#login-form input, #login-form button')
        .forEach((el) => {
          el.disabled = true;
        });
    }
  }
  const dialog = document.getElementById(id);
  if (dialog && !dialog.open) dialog.showModal();
};
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-dialog]');
  if (trigger) window.openStudyDialog(trigger.dataset.dialog);
  if (event.target.closest('[data-close]'))
    event.target.closest('dialog').close();
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    }
  });
});
// Only the backend validates the code. There is no static/client-side fallback.
document
  .getElementById('login-form')
  ?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const message = document.getElementById('login-message');
    button.disabled = true;
    message.textContent = 'Verificando acceso…';
    try {
      const sessionResponse = await fetch('/api/session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!sessionResponse.ok)
        throw new Error('No se pudo conectar con el servicio de ingreso.');
      const session = await sessionResponse.json();
      const fields = new FormData(form);
      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrf,
        },
        body: JSON.stringify({ code: fields.get('code') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo ingresar.');
      form.reset();
      window.location.assign('/campus');
    } catch (error) {
      message.textContent =
        error.message || 'No se pudo conectar con el campus de prueba.';
      form.elements.code.value = '';
    } finally {
      button.disabled = false;
    }
  });
