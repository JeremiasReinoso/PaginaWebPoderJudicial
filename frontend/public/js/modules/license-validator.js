/**
 * Client-side controller for the License Validation Gate in pages/material-estudio.html.
 * Never trusts localStorage as proof of activation: always verifies against the backend API.
 */
(() => {
  const gateSection = document.getElementById('license-activation-gate');
  if (!gateSection) return; // Runs ONLY on pages/material-estudio.html

  const form = document.getElementById('license-activation-form');
  const codeInput = document.getElementById('license-code-input');
  const submitBtn = document.getElementById('license-activate-btn');
  const processingIndicator = document.getElementById('license-processing');
  const feedbackEl = document.getElementById('license-feedback');
  const statusBadge = document.getElementById('license-status-badge');
  const unlockedPanel = document.getElementById('licensed-pdfs-panel');
  const pdfListContainer = document.getElementById('licensed-pdfs-list');
  const activeMetaEl = document.getElementById('license-active-meta');

  function setProcessing(isProcessing, text = 'Verificando con el servidor…') {
    if (processingIndicator) {
      processingIndicator.hidden = !isProcessing;
      processingIndicator.textContent = text;
    }
    if (submitBtn) submitBtn.disabled = isProcessing;
    if (codeInput) codeInput.disabled = isProcessing;
  }

  function showFeedback(message, kind = 'info') {
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.dataset.state = kind;
    feedbackEl.hidden = !message;
  }

  function validateCodeInput(raw) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return 'Ingresá el código de licencia provisto por el administrador.';
    }
    const cleaned = raw.replace(/[-\s]/g, '').toUpperCase();
    if (!/^PJ[0-9A-F]{40}$/.test(cleaned)) {
      return 'Formato inválido. El código debe comenzar con PJ- seguido de 10 bloques hexadecimales.';
    }
    return null;
  }

  function renderUnlockedMaterials(data) {
    if (statusBadge) {
      statusBadge.textContent = 'Licencia permanente activa';
      statusBadge.dataset.status = 'active';
    }
    if (form) form.hidden = true;

    if (activeMetaEl && data.license) {
      const activatedDate = data.license.activated_at
        ? new Date(data.license.activated_at).toLocaleString('es-AR')
        : 'Confirmada';
      activeMetaEl.textContent = `Prefijo: ${data.license.code_prefix} · Instalación autorizada: ${data.license.installation_id} · Activada: ${activatedDate} · Vigencia: Permanente (sin vencimiento)`;
    }

    if (pdfListContainer && Array.isArray(data.modules)) {
      pdfListContainer.replaceChildren(
        ...data.modules.map((mod) => {
          const card = document.createElement('article');
          card.className = 'feature-card';
          card.style.display = 'flex';
          card.style.flexDirection = 'column';
          card.style.justifyContent = 'space-between';

          const top = document.createElement('div');
          const tag = document.createElement('span');
          tag.className = 'eyebrow';
          tag.textContent = `${mod.pages} páginas · PDF oficial`;
          const title = document.createElement('h3');
          title.textContent = mod.title;
          const desc = document.createElement('p');
          desc.textContent = mod.description;
          top.append(tag, title, desc);

          const actions = document.createElement('div');
          actions.style.marginTop = '18px';
          const link = document.createElement('a');
          link.className = 'button';
          link.href = mod.pdfUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Abrir PDF de estudio';
          actions.append(link);

          card.append(top, actions);
          return card;
        }),
      );
    }

    if (unlockedPanel) {
      unlockedPanel.hidden = false;
    }
  }

  async function loadProtectedMaterials() {
    const response = await fetch('/api/licenses/study-materials', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error('No se pudo cargar el material protegido.');
    }
    const data = await response.json();
    renderUnlockedMaterials(data);
  }

  async function checkInitialStatus() {
    setProcessing(true, 'Comprobando estado de la licencia en el servidor…');
    showFeedback('');
    try {
      const response = await fetch('/api/licenses/status', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('El servidor de validación no respondió correctamente.');
      }
      const status = await response.json();
      if (status.activated) {
        await loadProtectedMaterials();
        showFeedback(
          'Instalación validada en el servidor. Acceso permanente a los PDFs de estudio habilitado.',
          'success',
        );
      } else if (statusBadge) {
        statusBadge.textContent = 'Requiere activación de licencia';
        statusBadge.dataset.status = 'inactive';
      }
    } catch {
      if (statusBadge) {
        statusBadge.textContent = 'Sin conexión con el servidor de licencias';
        statusBadge.dataset.status = 'error';
      }
      showFeedback(
        'No se pudo conectar con el servidor de validación de licencias. Verificá tu conexión e intentá nuevamente.',
        'error',
      );
    } finally {
      setProcessing(false);
    }
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rawCode = codeInput ? codeInput.value : '';
    const validationError = validateCodeInput(rawCode);
    if (validationError) {
      showFeedback(validationError, 'error');
      codeInput?.focus();
      return;
    }

    setProcessing(true, 'Validando y registrando activación en el servidor…');
    showFeedback('');

    try {
      const response = await fetch('/api/licenses/activate', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: rawCode.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.activated) {
        throw new Error(
          result.error ||
            'No se pudo activar la licencia. Verificá el código ingresado.',
        );
      }
      if (codeInput) codeInput.value = '';
      await loadProtectedMaterials();
      showFeedback(
        'Licencia activada correctamente. Esta instalación quedó habilitada de forma permanente sin fecha de vencimiento.',
        'success',
      );
    } catch (error) {
      if (error instanceof TypeError) {
        showFeedback(
          'Error de conexión con el servidor de validación. Intentá nuevamente en unos instantes.',
          'error',
        );
      } else {
        showFeedback(
          error.message || 'No se pudo completar la activación.',
          'error',
        );
      }
    } finally {
      setProcessing(false);
    }
  });

  checkInitialStatus();
})();
