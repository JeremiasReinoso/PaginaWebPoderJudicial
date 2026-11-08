// Keep pasted licenses usable while rejecting unrelated characters and excess length.
document.querySelectorAll('#login-form input[name="code"], #license-code-input').forEach((input) => {
  const library = input.id === 'license-code-input';
  input.maxLength = 52;
  input.pattern = library ? 'PJ[- ]*([0-9A-Fa-f][- ]*){40}' : '(PJ[- ]*([0-9A-Fa-f][- ]*){40}|MJ[- ]*([0-9A-Fa-f][- ]*){32})';
  input.title = 'Pegá el código personal que te entregó el administrador.';
  input.addEventListener('input', () => {
    const start = input.selectionStart;
    const value = input.value.toUpperCase().replace(/[^0-9A-FPJM -]/g, '').slice(0, 52);
    if (value !== input.value) {
      input.value = value;
      input.setSelectionRange(Math.min(start, value.length), Math.min(start, value.length));
    }
    input.setCustomValidity('');
  });
  input.addEventListener('invalid', () => {
    input.setCustomValidity(input.validity.valueMissing ? 'Ingresá tu código de acceso.' : 'Revisá el código o pegalo completo desde el mensaje del administrador.');
  });
});

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
function resolveCampusEntryUrl() {
  const path = location.pathname;
  if (path.includes('/frontend/public/pages/')) {
    return new URL('../../campus/index.html', location.href).href;
  }
  if (path.includes('/frontend/public/')) {
    return new URL('../campus/index.html', location.href).href;
  }
  if (path.includes('/pages/')) {
    return new URL('../campus/index.html', location.href).href;
  }
  return new URL('./campus/index.html', location.href).href;
}
function resolveClientBackendUrl() {
  const path = location.pathname;
  if (path.includes('/frontend/public/pages/')) {
    return new URL('../../campus/client_backend.js', location.href).href;
  }
  if (path.includes('/frontend/public/')) {
    return new URL('../campus/client_backend.js', location.href).href;
  }
  if (path.includes('/pages/')) {
    return new URL('../campus/client_backend.js', location.href).href;
  }
  return new URL('./campus/client_backend.js', location.href).href;
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
  }
  const dialog = document.getElementById(id);
  if (dialog && !dialog.open) dialog.showModal();
};
document.addEventListener('click', (event) => {
  const reveal = event.target.closest('.login-reveal');
  if (reveal) {
    const input = reveal.closest('form').elements.code;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    reveal.textContent = show ? 'Ocultar' : 'Mostrar';
    reveal.setAttribute('aria-label', show ? 'Ocultar código' : 'Mostrar código');
    reveal.setAttribute('aria-pressed', String(show));
  }
  const trigger = event.target.closest('[data-dialog]');
  if (trigger) window.openStudyDialog(trigger.dataset.dialog);
  if (event.target.closest('[data-close]'))
    event.target.closest('dialog').close();
  const copyBtn = event.target.closest('[data-copy-alias]');
  if (copyBtn) {
    const aliasText =
      copyBtn.dataset.copyAlias ||
      window.METODO_JUDICIAL_CONFIG?.paymentAlias ||
      'CURSOPODER.1';
    const originalLabel = copyBtn.textContent;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(aliasText)
        .then(() => {
          copyBtn.textContent = '¡Alias copiado!';
          setTimeout(() => {
            copyBtn.textContent = originalLabel;
          }, 2200);
        })
        .catch(() => {
          copyBtn.textContent = aliasText;
        });
    } else {
      copyBtn.textContent = aliasText;
    }
  }
});
(() => {
  const configuredEmail = window.METODO_JUDICIAL_CONFIG?.protonEmail?.trim();
  if (!configuredEmail) return;
  document.querySelectorAll('[data-proton-slot]').forEach((slot) => {
    const link = document.createElement('a');
    link.href = `mailto:${configuredEmail}`;
    link.className = 'proton-mail-badge';
    link.textContent = configuredEmail;
    slot.replaceChildren(link);
  });
})();
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
document
  .getElementById('login-form')
  ?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const message = document.getElementById('login-message');
    button.disabled = true;
    message.textContent = 'Verificando acceso…';
    const fields = new FormData(form);
    const code = fields.get('code');
    try {
      let usedServer = false;
      try {
        const sessionResponse = await fetch('/api/session', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const contentType = sessionResponse.headers.get('content-type') || '';
        if (sessionResponse.ok && contentType.includes('application/json')) {
          usedServer = true;
          const session = await sessionResponse.json();
          const response = await fetch('/api/login', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': session.csrf,
            },
            body: JSON.stringify({ code }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || 'No se pudo ingresar.');
          form.reset();
          window.location.assign('/campus/');
          return;
        }
      } catch (serverErr) {
        if (usedServer) throw serverErr;
      }
      const { clientLogin } = await import(resolveClientBackendUrl());
      await clientLogin(String(code || ''));
      form.reset();
      window.location.assign(resolveCampusEntryUrl());
    } catch (error) {
      message.textContent =
        error.message || 'No se pudo conectar con el campus de prueba.';
      form.elements.code.value = '';
    } finally {
      button.disabled = false;
    }
  });
