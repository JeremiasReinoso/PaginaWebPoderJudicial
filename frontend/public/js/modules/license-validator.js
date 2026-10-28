/**
 * Controlador de validación de licencias exclusivo para pages/material-estudio.html.
 * Opera contra el servidor (/api/licenses/*) cuando está activo y cuenta con motor
 * criptográfico de respaldo sincronizado con el panel administrativo (frontend/admin/index.html).
 */
(() => {
  const gateSection = document.getElementById('license-activation-gate');
  if (!gateSection) return; // Solo se ejecuta en pages/material-estudio.html

  const STORAGE_KEY = 'mj_judicial_license_store_v1';
  const INST_CRED_KEY = 'mj_judicial_installation_cred_v1';
  const CODE_SIGN_SALT = 'mj-pj-license-sig-2026';

  const STATIC_STUDY_MODULES = [
    {
      id: '1',
      title: 'Módulo 1 · Organización del Estado',
      pages: 69,
      description:
        'Constitución Nacional y Provincial, división de poderes, órganos de control y organización estatal.',
      pdfUrl:
        '../../../assets%20/pdfs-estudio/2026-Ingreso-Modulo-1-Organizacion-del-Estado-Material-de-Estudio.pdf',
    },
    {
      id: '2',
      title: 'Módulo 2 · El Poder Judicial de Mendoza',
      pages: 136,
      description:
        'Estructura jurisdiccional y administrativa, fueros, Ministerio Público, acordadas y carrera judicial.',
      pdfUrl:
        '../../../assets%20/pdfs-estudio/2026-Ingreso-Modulo-2-El-Poder-Judicial-de-Mendoza-Material-de-Estudio.pdf',
    },
    {
      id: '3',
      title: 'Módulo 3 · Derechos Humanos',
      pages: 48,
      description:
        'Sistema interamericano y universal, bloque de constitucionalidad federal y estándares de protección.',
      pdfUrl:
        '../../../assets%20/pdfs-estudio/2026-Ingreso-Modulo-3-Derechos-Humanos-Material-de-Estudio.pdf',
    },
    {
      id: '4',
      title: 'Módulo 4 · Violencia de Género',
      pages: 45,
      description:
        'Ley 26.485, Ley Micaela, Convención de Belém do Pará y protocolos de actuación judicial.',
      pdfUrl:
        '../../../assets%20/pdfs-estudio/2026-Ingreso-Modulo-4-Violencia-de-Genero-Material-de-Estudio.pdf',
    },
    {
      id: '5',
      title: 'Módulo 5 · Atención para un Servicio de Justicia',
      pages: 64,
      description:
        'Trato digno, acceso a la justicia, lenguaje claro, ética pública y atención a la ciudadanía.',
      pdfUrl:
        '../../../assets%20/pdfs-estudio/2026-Ingreso-Modulo-5-Atencion-para-un-Servicio-de-Justicia-Material-de-Estudio-1.pdf',
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

  let staticMode = false;

  function sha256Hex(ascii) {
    const bytes = new TextEncoder().encode(String(ascii));
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
      0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
      0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
      0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
      0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    const H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const bitLen = bytes.length * 8;
    const totalLen = (((bytes.length + 9 + 63) >> 6) << 6);
    const msg = new Uint8Array(totalLen);
    msg.set(bytes);
    msg[bytes.length] = 0x80;
    const view = new DataView(msg.buffer);
    view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
    view.setUint32(totalLen - 4, bitLen >>> 0, false);

    const W = new Uint32Array(64);
    const rotr = (n, x) => (x >>> n) | (x << (32 - n));

    for (let offset = 0; offset < totalLen; offset += 64) {
      for (let i = 0; i < 16; i += 1) {
        W[i] = view.getUint32(offset + i * 4, false);
      }
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
        const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i += 1) {
        const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0;
      H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0;
      H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0;
      H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0;
      H[7] = (H[7] + h) >>> 0;
    }
    return H.map((v) => v.toString(16).padStart(8, '0')).join('');
  }

  function randomHex(byteLength) {
    const arr = new Uint8Array(byteLength);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < byteLength; i += 1) {
        arr[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
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
    if (parts.length !== 3) return { activated: false };
    const [installationId, rawCredential, sig] = parts;
    const expectedSig = sha256Hex(
      `${CODE_SIGN_SALT}:inst:${installationId}:${rawCredential}`,
    ).slice(0, 16);
    if (sig !== expectedSig) return { activated: false };

    const credHash = sha256Hex(rawCredential);
    const license = store.licenses.find(
      (l) =>
        l.installation_id === installationId &&
        l.status === 'activated' &&
        l.installation_credential_hash === credHash,
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
      modules: STATIC_STUDY_MODULES,
    };
  }

  function activateLocalLicense(rawCode) {
    const cleaned = rawCode.replace(/[-\s]/g, '').toUpperCase();
    if (!/^PJ[0-9A-F]{40}$/.test(cleaned)) {
      throw new Error(
        'Formato inválido. El código debe comenzar con PJ- seguido de 10 bloques hexadecimales.',
      );
    }

    const codeHash = sha256Hex(cleaned);
    const bodyHex = cleaned.slice(2, 34);
    const sigHex = cleaned.slice(34, 42);
    const expectedSig = sha256Hex(`${CODE_SIGN_SALT}:${bodyHex}`)
      .slice(0, 8)
      .toUpperCase();
    const prefix = `PJ-${cleaned.slice(2, 6)}-${cleaned.slice(6, 10)}`;

    const store = loadLocalStore();
    const nowIso = new Date().toISOString();
    let license = store.licenses.find((l) => l.code_hash === codeHash);

    // Si se abrió en orígenes distintos (ej. file://) pero el código tiene firma criptográfica auténtica del panel de Sheila
    if (!license && sigHex === expectedSig) {
      license = {
        id: `lic_${randomHex(8)}`,
        code_hash: codeHash,
        code_prefix: prefix,
        client_reference: 'Emitida en panel administrativo',
        status: 'available',
        created_at: nowIso,
        activated_at: null,
        installation_id: null,
        created_by_username: 'Sheila',
        revoked_at: null,
      };
      store.licenses.unshift(license);
    }

    if (!license) {
      store.activations.unshift({
        id: randomHex(8),
        license_id: null,
        installation_id: 'inst_unknown',
        activated_at: nowIso,
        activation_result: 'rejected_not_found',
      });
      saveLocalStore(store);
      throw new Error('El código de licencia ingresado no es válido.');
    }

    if (license.status === 'revoked') {
      store.activations.unshift({
        id: randomHex(8),
        license_id: license.id,
        installation_id: license.installation_id || 'inst_revoked',
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
      store.auditLogs.unshift({
        id: randomHex(8),
        actor_username: 'Sistema',
        action: 'LICENSE_ACTIVATION_REJECTED_DUPLICATE',
        entity_type: 'Licenses',
        entity_id: license.id,
        timestamp: nowIso,
      });
      saveLocalStore(store);
      throw new Error(
        'Este código de licencia ya fue utilizado y no puede volver a activarse.',
      );
    }

    const installationId = `inst_${randomHex(8).toLowerCase()}`;
    const rawCredential = randomHex(16);
    const credHash = sha256Hex(rawCredential);
    const tokenSig = sha256Hex(
      `${CODE_SIGN_SALT}:inst:${installationId}:${rawCredential}`,
    ).slice(0, 16);
    const signedToken = `${installationId}.${rawCredential}.${tokenSig}`;

    license.status = 'activated';
    license.activated_at = nowIso;
    license.installation_id = installationId;
    license.installation_credential_hash = credHash;

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
      modules: STATIC_STUDY_MODULES,
    };
  }

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

    setProcessing(true, 'Validando y registrando activación…');
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
      if (error instanceof TypeError) {
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
