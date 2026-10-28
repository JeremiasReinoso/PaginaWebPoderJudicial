/**
 * Controlador de validación de licencias exclusivo para pages/material-estudio.html.
 * Funciona de forma 100% autónoma en el navegador (localStorage sincronizado con el panel de Sheila),
 * y también se conecta con el backend (/api/licenses/*) si se estuviera ejecutando en un servidor.
 */
(() => {
  const gateSection = document.getElementById('license-activation-gate');
  if (!gateSection) return; // Solo opera en pages/material-estudio.html

  const STORAGE_KEY = 'mj_judicial_license_store_v1';
  const INST_CRED_KEY = 'mj_judicial_installation_cred_v1';

  // Catálogo de PDFs de estudio
  const STUDY_MODULES = [
    {
      id: '1',
      title: 'Módulo 1 · Organización del Estado',
      pages: 39,
      description: 'El Estado, el Derecho y las bases de la organización constitucional.',
      pdfUrl: '../../../assets%20/pdfs-estudio/Concurso-Ingreso-2026-SCJM-Modulo-1-Organizacion-del-Estado-Material-de-Estudio.pdf',
    },
    {
      id: '2',
      title: 'Módulo 2 · El Poder Judicial de Mendoza',
      pages: 113,
      description: 'Los fueros jurisdiccionales y el funcionamiento de la justicia mendocina.',
      pdfUrl: '../../../assets%20/pdfs-estudio/Concurso-Ingreso-2026-SCJM-Modulo-2-El-Poder-Judicial-de-Mendoza-Material-de-Estudio.pdf',
    },
    {
      id: '3',
      title: 'Módulo 3 · Derechos Humanos',
      pages: 23,
      description: 'La dignidad de las personas y la cultura de derechos humanos en la justicia.',
      pdfUrl: '../../../assets%20/pdfs-estudio/Concurso-Ingreso-2026-SCJM-Modulo-3-Derechos-Humanos-Material-de-Estudio.pdf',
    },
    {
      id: '4',
      title: 'Módulo 4 · Violencia de Género',
      pages: 10,
      description: 'Perspectiva de género, conceptos elementales y marco normativo.',
      pdfUrl: '../../../assets%20/pdfs-estudio/Concurso-Ingreso-2026-SCJM-Modulo-4-Violencia-de-Genero-Material-de-Estudio.pdf',
    },
    {
      id: '5',
      title: 'Módulo 5 · Atención para un Servicio de Justicia',
      pages: 32,
      description: 'Un servicio judicial centrado en la ciudadanía y el trato digno.',
      pdfUrl: '../../../assets%20/pdfs-estudio/Concurso-Ingreso-2026-SCJM-Modulo-5-Atencion-para-un-Servicio-de-Justicia-Material-de-Estudio-1.pdf',
    },
  ];

  const form = document.getElementById('license-activation-form');
  const codeInput = document.getElementById('license-code-input');
  const submitBtn = document.getElementById('license-activate-btn');
  const processingIndicator = document.getElementById('license-processing');
  const feedbackEl = document.getElementById('license-feedback');
  const statusBadge = document.getElementById('license-status-badge');
  const unlockedPanel = document.getElementById('licensed-pdfs-panel');
  const pdfListContainer = document.getElementById('licensed-pdfs-list');
  const activeMetaEl = document.getElementById('license-active-meta');

  let staticMode = (location.protocol === 'file:') || !location.port || location.port === '5500';

  function randomHex(length) {
    const hex = '0123456789ABCDEF';
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += hex[Math.floor(Math.random() * 16)];
    }
    return out;
  }

  function loadLocalStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.licenses)) return parsed;
      }
    } catch {
      // ignore
    }
    return {
      licenses: [],
      auditLogs: [],
      activations: [],
    };
  }

  function saveLocalStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // ignore
    }
  }

  function verifyLocalInstallationStatus() {
    const store = loadLocalStore();
    let token = '';
    try {
      token = localStorage.getItem(INST_CRED_KEY) || '';
    } catch {
      token = '';
    }
    if (!token) return { activated: false };

    const parts = token.split('.');
    if (parts.length !== 2) return { activated: false };
    const [installationId, credential] = parts;

    const license = store.licenses.find(
      (l) =>
        l.installation_id === installationId &&
        l.status === 'activated' &&
        l.installation_credential === credential,
    );
    if (!license) return { activated: false };

    return {
      activated: true,
      permanent: true,
      license: {
        code_prefix: license.code_prefix,
        installation_id: license.installation_id,
        activated_at: license.activated_at,
        permanent: true,
      },
      modules: STUDY_MODULES,
    };
  }

  function activateLocalLicense(rawCode) {
    const cleaned = rawCode.replace(/[-\s]/g, '').toUpperCase();
    if (!/^PJ[0-9A-F]{40}$/.test(cleaned)) {
      throw new Error(
        'Formato inválido. El código debe comenzar con PJ- seguido de 10 bloques hexadecimales.',
      );
    }

    const prefix = `PJ-${cleaned.slice(2, 6)}-${cleaned.slice(6, 10)}`;
    const store = loadLocalStore();
    const nowIso = new Date().toISOString();

    let license = store.licenses.find(
      (l) => l.code === cleaned || l.fullCode === rawCode.trim(),
    );

    // Si el código no está previamente en este navegador (por ejemplo abierto desde un archivo diferente)
    // se registra como emitido por el sistema
    if (!license) {
      license = {
        id: `lic_${randomHex(8).toLowerCase()}`,
        code: cleaned,
        fullCode: rawCode.trim(),
        code_prefix: prefix,
        client_reference: 'Licencia autorizada',
        status: 'available',
        created_at: nowIso,
        activated_at: null,
        installation_id: null,
        created_by_username: 'Sheila',
        revoked_at: null,
      };
      store.licenses.unshift(license);
    }

    if (license.status === 'revoked') {
      store.activations.unshift({
        id: randomHex(8),
        license_id: license.id,
        installation_id: 'inst_revoked',
        activated_at: nowIso,
        activation_result: 'rejected_revoked',
      });
      saveLocalStore(store);
      throw new Error('Esta licencia fue revocada y no puede utilizarse.');
    }

    if (license.status === 'activated') {
      store.activations.unshift({
        id: randomHex(8),
        license_id: license.id,
        installation_id: license.installation_id || 'inst_duplicate',
        activated_at: nowIso,
        activation_result: 'rejected_already_used',
      });
      saveLocalStore(store);
      throw new Error(
        'Este código de licencia ya fue utilizado y no puede volver a activarse.',
      );
    }

    const installationId = `inst_${randomHex(8).toLowerCase()}`;
    const rawCredential = randomHex(32).toLowerCase();
    const signedToken = `${installationId}.${rawCredential}`;

    license.status = 'activated';
    license.activated_at = nowIso;
    license.installation_id = installationId;
    license.installation_credential = rawCredential;

    store.activations.unshift({
      id: randomHex(8),
      license_id: license.id,
      installation_id: installationId,
      activated_at: nowIso,
      activation_result: 'activated',
    });

    store.auditLogs.unshift({
      id: randomHex(8),
      actor_username: 'Sistema',
      action: 'LICENSE_ACTIVATED',
      entity_type: 'Licenses',
      entity_id: license.id,
      timestamp: nowIso,
    });

    saveLocalStore(store);

    try {
      localStorage.setItem(INST_CRED_KEY, signedToken);
    } catch {
      // ignore
    }

    return {
      activated: true,
      permanent: true,
      license: {
        code_prefix: license.code_prefix,
        installation_id: installationId,
        activated_at: nowIso,
        permanent: true,
      },
      modules: STUDY_MODULES,
    };
  }

  function setProcessing(isProcessing, text = 'Comprobando estado…') {
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
    if (staticMode) {
      const localStatus = verifyLocalInstallationStatus();
      if (localStatus.activated) {
        renderUnlockedMaterials(localStatus);
      }
      return;
    }
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
    setProcessing(true, 'Comprobando estado de la licencia…');
    showFeedback('');
    try {
      if (staticMode) {
        throw new Error('Static direct mode');
      }
      const response = await fetch('/api/licenses/status', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) {
        throw new Error('Static fallback');
      }
      const status = await response.json();
      if (status.activated) {
        await loadProtectedMaterials();
        showFeedback(
          'Instalación validada. Acceso permanente a los PDFs de estudio habilitado.',
          'success',
        );
      } else if (statusBadge) {
        statusBadge.textContent = 'Requiere activación de licencia';
        statusBadge.dataset.status = 'inactive';
      }
    } catch {
      staticMode = true;
      const localStatus = verifyLocalInstallationStatus();
      if (localStatus.activated) {
        renderUnlockedMaterials(localStatus);
        showFeedback(
          'Instalación validada. Acceso permanente a los PDFs de estudio habilitado.',
          'success',
        );
      } else if (statusBadge) {
        statusBadge.textContent = 'Requiere activación de licencia';
        statusBadge.dataset.status = 'inactive';
      }
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

    setProcessing(true, 'Validando licencia…');
    showFeedback('');

    try {
      if (staticMode) {
        const localResult = activateLocalLicense(rawCode.trim());
        if (codeInput) codeInput.value = '';
        renderUnlockedMaterials(localResult);
        showFeedback(
          'Licencia activada correctamente. Esta instalación quedó habilitada de forma permanente sin fecha de vencimiento.',
          'success',
        );
        return;
      }

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
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        staticMode = true;
        const localResult = activateLocalLicense(rawCode.trim());
        if (codeInput) codeInput.value = '';
        renderUnlockedMaterials(localResult);
        showFeedback(
          'Licencia activada correctamente. Esta instalación quedó habilitada de forma permanente sin fecha de vencimiento.',
          'success',
        );
        return;
      }

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
      if (error instanceof TypeError || staticMode) {
        staticMode = true;
        try {
          const localResult = activateLocalLicense(rawCode.trim());
          if (codeInput) codeInput.value = '';
          renderUnlockedMaterials(localResult);
          showFeedback(
            'Licencia activada correctamente. Esta instalación quedó habilitada de forma permanente sin fecha de vencimiento.',
            'success',
          );
        } catch (localErr) {
          showFeedback(
            localErr.message || 'No se pudo completar la activación.',
            'error',
          );
        }
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
