/**
 * Controlador de validación de licencias exclusivo para pages/material-estudio.html.
 * Funciona de forma 100% estática y autónoma en el navegador validando las credenciales
 * generadas en el panel administrativo (Sheila2026), y también se sincroniza con el
 * servidor local si estuviese activo.
 */
(() => {
  const gateSection = document.getElementById('license-activation-gate');
  if (!gateSection) return;

  const STORAGE_KEY = 'mj_judicial_license_store_v1';
  const INST_CRED_KEY = 'mj_judicial_installation_cred_v1';
  const CAMPUS_RUNTIME_KEY = 'mj_campus_runtime_v1';

  const isSourceTree =
    location.protocol === 'file:' ||
    location.pathname.includes('/frontend/public/');

  function resolvePdfUrl(id, originalFilename) {
    if (isSourceTree) {
      return `../../../assets%20/pdfs-estudio/${originalFilename}`;
    }
    return `../assets/pdfs-estudio/module-${id}.pdf`;
  }

  const STUDY_MODULES = [
    {
      id: '1',
      title: 'Módulo 1 · Organización del Estado',
      pages: 39,
      description:
        'El Estado, el Derecho y las bases de la organización constitucional.',
      pdfUrl: resolvePdfUrl(
        1,
        'Concurso-Ingreso-2026-SCJM-Modulo-1-Organizacion-del-Estado-Material-de-Estudio.pdf',
      ),
    },
    {
      id: '2',
      title: 'Módulo 2 · El Poder Judicial de Mendoza',
      pages: 113,
      description:
        'Los fueros jurisdiccionales y el funcionamiento de la justicia mendocina.',
      pdfUrl: resolvePdfUrl(
        2,
        'Concurso-Ingreso-2026-SCJM-Modulo-2-El-Poder-Judicial-de-Mendoza-Material-de-Estudio.pdf',
      ),
    },
    {
      id: '3',
      title: 'Módulo 3 · Derechos Humanos',
      pages: 23,
      description:
        'La dignidad de las personas y la cultura de derechos humanos en la justicia.',
      pdfUrl: resolvePdfUrl(
        3,
        'Concurso-Ingreso-2026-SCJM-Modulo-3-Derechos-Humanos-Material-de-Estudio.pdf',
      ),
    },
    {
      id: '4',
      title: 'Módulo 4 · Violencia de Género',
      pages: 10,
      description:
        'Perspectiva de género, conceptos elementales y marco normativo.',
      pdfUrl: resolvePdfUrl(
        4,
        'Concurso-Ingreso-2026-SCJM-Modulo-4-Violencia-de-Genero-Material-de-Estudio.pdf',
      ),
    },
    {
      id: '5',
      title: 'Módulo 5 · Atención para un Servicio de Justicia',
      pages: 32,
      description:
        'Un servicio judicial centrado en la ciudadanía y el trato digno.',
      pdfUrl: resolvePdfUrl(
        5,
        'Concurso-Ingreso-2026-SCJM-Modulo-5-Atencion-para-un-Servicio-de-Justicia-Material-de-Estudio-1.pdf',
      ),
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

  let staticMode =
    location.protocol === 'file:' ||
    location.hostname.endsWith('github.io') ||
    !location.port ||
    location.port === '5500';

  function randomHex(length) {
    const hex = '0123456789ABCDEF';
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += hex[Math.floor(Math.random() * 16)];
    }
    return out;
  }

  function computePanelSignature(hex32) {
    const secret = 'MJ_PANEL_SHEILA_2026_AUTH_KEY';
    const input = `${secret}:${String(hex32).toUpperCase()}`;
    let h1 = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
      h1 ^= input.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    return h1.toString(16).padStart(8, '0').toUpperCase();
  }

  function hasValidPanelSignature(cleaned) {
    if (!/^PJ[0-9A-F]{40}$/.test(cleaned)) return false;
    const bodyHex = cleaned.slice(2, 34);
    const sigHex = cleaned.slice(34, 42);
    return computePanelSignature(bodyHex) === sigHex;
  }

  function loadLocalStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.licenses)) {
          parsed.auditLogs = Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [];
          parsed.activations = Array.isArray(parsed.activations) ? parsed.activations : [];
          return parsed;
        }
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

  function syncCampusSession(codePrefix) {
    try {
      const now = Date.now() / 1000;
      const raw = sessionStorage.getItem(CAMPUS_RUNTIME_KEY);
      const state = raw
        ? JSON.parse(raw)
        : { session: null, failures: [], attempts: {}, rotation: {} };
      const principal = `estudiante_${String(codePrefix || 'licencia').replace(/[^A-Za-z0-9]/g, '')}`;
      state.session = {
        username: principal,
        csrf: randomHex(24).toLowerCase(),
        created: now,
        touched: now,
      };
      sessionStorage.setItem(CAMPUS_RUNTIME_KEY, JSON.stringify(state));
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

    let license = null;
    if (token.startsWith('{')) {
      try {
        const parsedCred = JSON.parse(token);
        license = store.licenses.find(
          (l) => l.id === parsedCred.licenseId && l.status === 'activated',
        );
      } catch {}
    } else {
      const parts = token.split('.');
      if (parts.length === 2) {
        const [installationId, credential] = parts;
        license = store.licenses.find(
          (l) =>
            (l.installation_id === installationId ||
              l.installationId === installationId) &&
            l.status === 'activated' &&
            (!l.installation_credential ||
              l.installation_credential === credential),
        );
      }
    }

    if (!license) return { activated: false };

    const codePrefix = license.code_prefix || license.prefix || 'PJ-ACTIVA';
    const instId = license.installation_id || license.installationId || 'inst_local';
    const actAt = license.activated_at || license.activatedAt || license.created_at;
    syncCampusSession(codePrefix);

    return {
      activated: true,
      permanent: true,
      license: {
        code_prefix: codePrefix,
        installation_id: instId,
        activated_at: actAt,
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

    let license = store.licenses.find((l) => {
      const candidate =
        l.code ||
        l.clean ||
        (l.fullCode ? l.fullCode.replace(/[-\s]/g, '').toUpperCase() : '');
      return (
        candidate === cleaned ||
        (l.code && l.code.replace(/[-\s]/g, '').toUpperCase() === cleaned) ||
        l.fullCode === rawCode.trim()
      );
    });

    if (!license) {
      if (!hasValidPanelSignature(cleaned)) {
        throw new Error(
          'Código de licencia inválido o no registrado. Solo se aceptan credenciales generadas en el panel administrativo.',
        );
      }
      license = {
        id: `lic_${randomHex(8).toLowerCase()}`,
        code: cleaned,
        clean: cleaned,
        fullCode: rawCode.trim(),
        code_prefix: prefix,
        prefix,
        client_reference: 'Estudiante autorizado',
        status: 'available',
        created_at: nowIso,
        activated_at: null,
        installation_id: null,
        created_by_username: 'Sheila2026',
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
        installation_id:
          license.installation_id || license.installationId || 'inst_duplicate',
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
    const codePrefix = license.code_prefix || license.prefix || prefix;

    license.status = 'activated';
    license.activated_at = nowIso;
    license.activatedAt = nowIso;
    license.installation_id = installationId;
    license.installationId = installationId;
    license.installation_credential = rawCredential;
    license.code_prefix = codePrefix;

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

    syncCampusSession(codePrefix);

    return {
      activated: true,
      permanent: true,
      license: {
        code_prefix: codePrefix,
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
    const localStatus = verifyLocalInstallationStatus();
    if (localStatus.activated) {
      renderUnlockedMaterials(localStatus);
      showFeedback(
        'Instalación validada. Acceso permanente a los PDFs de estudio habilitado.',
        'success',
      );
      setProcessing(false);
      return;
    }

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
      if (statusBadge) {
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
        // Si fue generada en el panel estático local, intentar activación local
        try {
          const localResult = activateLocalLicense(rawCode.trim());
          if (codeInput) codeInput.value = '';
          renderUnlockedMaterials(localResult);
          showFeedback(
            'Licencia activada correctamente. Esta instalación quedó habilitada de forma permanente sin fecha de vencimiento.',
            'success',
          );
          return;
        } catch {}
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
