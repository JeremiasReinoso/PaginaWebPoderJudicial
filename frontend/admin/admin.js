/**
 * Panel Administrativo de Licencias — Método Judicial.
 * Conecta con el backend (/api/admin/*) cuando el servidor está activo y dispone de
 * motor criptográfico local de respaldo para uso directo desde el navegador.
 */
(() => {
  if (window.__MJ_ADMIN_PANEL_INIT__) return;
  window.__MJ_ADMIN_PANEL_INIT__ = true;

  const STORAGE_KEY = 'mj_judicial_license_store_v1';
  const SESSION_KEY = 'mj_judicial_admin_session_v1';
  // Salted SHA-256 digest of 'mj-admin-salt-2026:sheila:<password>' (never stores plaintext password)
  const SHEILA_DIGEST =
    '7fa83e51e152433378d691be3b9579b3050fae6de0f123d29bdc2d8b57c5a9fe';
  const CODE_SIGN_SALT = 'mj-pj-license-sig-2026';

  let csrfToken = '';
  let staticMode = false;

  const $ = (id) => document.getElementById(id);

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  // Pure-JS SHA-256 implementation so hashing works in every context (including file://)
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

  function generateSignedLicenseCode() {
    // 16 random bytes (32 hex chars = 8 groups of 4) + 4 signature bytes (8 hex chars = 2 groups of 4)
    const bodyHex = randomHex(16);
    const sigHex = sha256Hex(`${CODE_SIGN_SALT}:${bodyHex}`)
      .slice(0, 8)
      .toUpperCase();
    const fullHex = bodyHex + sigHex;
    const groups = [];
    for (let i = 0; i < fullHex.length; i += 4) {
      groups.push(fullHex.slice(i, i + 4));
    }
    const code = `PJ-${groups.join('-')}`;
    const prefix = `PJ-${groups[0]}-${groups[1]}`;
    const normalized = `PJ${fullHex}`;
    return { code, prefix, normalized, codeHash: sha256Hex(normalized) };
  }

  function loadLocalStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.licenses)) return parsed;
      }
    } catch {
      // ignore storage error
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
      // ignore storage error
    }
  }

  function getLocalSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function setLocalSession(session) {
    try {
      if (!session) {
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
    } catch {
      // ignore
    }
  }

  function localAdminApi(path, body) {
    const store = loadLocalStore();
    const parsedUrl = new URL(path, 'http://localhost');
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/admin/session' && body === undefined) {
      const sess = getLocalSession();
      if (!sess) return { authenticated: false };
      return {
        authenticated: true,
        csrf: sess.csrf,
        admin: sess.admin,
      };
    }

    if (pathname === '/api/admin/login' && body !== undefined) {
      const usernameRaw = String(body.username || '').trim();
      const normalizedUser = usernameRaw.toLowerCase();
      const password = String(body.password || '');
      if (!normalizedUser || !password) {
        throw new Error('Ingresá usuario y contraseña administrativos.');
      }
      const candidateDigest = sha256Hex(
        `mj-admin-salt-2026:${normalizedUser}:${password.normalize('NFC')}`,
      );
      if (normalizedUser !== 'sheila' || candidateDigest !== SHEILA_DIGEST) {
        throw new Error('Credenciales administrativas inválidas.');
      }
      const sess = {
        csrf: randomHex(16),
        admin: {
          id: 'admin-sheila-2026',
          username: 'Sheila',
          role: 'admin',
        },
      };
      setLocalSession(sess);
      store.auditLogs.unshift({
        id: randomHex(8),
        actor_username: 'Sheila',
        action: 'ADMIN_LOGIN_SUCCESS',
        entity_type: 'AdminUsers',
        timestamp: new Date().toISOString(),
      });
      saveLocalStore(store);
      return {
        authenticated: true,
        csrf: sess.csrf,
        admin: sess.admin,
      };
    }

    const sess = getLocalSession();
    if (!sess) {
      const err = new Error('Iniciá sesión administrativa para continuar.');
      err.status = 401;
      throw err;
    }

    if (pathname === '/api/admin/logout') {
      setLocalSession(null);
      store.auditLogs.unshift({
        id: randomHex(8),
        actor_username: sess.admin.username,
        action: 'ADMIN_LOGOUT',
        entity_type: 'AdminSessions',
        timestamp: new Date().toISOString(),
      });
      saveLocalStore(store);
      return { ok: true };
    }

    if (pathname === '/api/admin/licenses' && body === undefined) {
      const statusFilter = parsedUrl.searchParams.get('status') || '';
      const searchFilter = (parsedUrl.searchParams.get('search') || '')
        .trim()
        .toLowerCase();

      const stats = { total: 0, available: 0, activated: 0, revoked: 0 };
      for (const lic of store.licenses) {
        stats.total += 1;
        if (stats[lic.status] !== undefined) stats[lic.status] += 1;
      }

      const filtered = store.licenses.filter((lic) => {
        if (statusFilter && lic.status !== statusFilter) return false;
        if (searchFilter) {
          const hay = `${lic.code_prefix} ${lic.client_reference || ''} ${lic.installation_id || ''}`.toLowerCase();
          if (!hay.includes(searchFilter)) return false;
        }
        return true;
      });

      const safeLicenses = filtered.map((lic) => ({
        id: lic.id,
        code_prefix: lic.code_prefix,
        client_reference: lic.client_reference,
        status: lic.status,
        created_at: lic.created_at,
        activated_at: lic.activated_at,
        installation_id: lic.installation_id,
        created_by_username: lic.created_by_username || 'Sheila',
        revoked_at: lic.revoked_at,
      }));

      return {
        stats,
        licenses: safeLicenses,
        auditLogs: store.auditLogs.slice(0, 50),
        activations: store.activations.slice(0, 50),
      };
    }

    if (pathname === '/api/admin/licenses/create' && body !== undefined) {
      const cleanRef =
        typeof body.client_reference === 'string' && body.client_reference.trim()
          ? body.client_reference.trim().slice(0, 120)
          : null;
      const { code, prefix, codeHash } = generateSignedLicenseCode();
      const nowIso = new Date().toISOString();
      const id = `lic_${randomHex(8)}`;

      store.licenses.unshift({
        id,
        code_hash: codeHash,
        code_prefix: prefix,
        client_reference: cleanRef,
        status: 'available',
        created_at: nowIso,
        activated_at: null,
        installation_id: null,
        created_by_username: sess.admin.username,
        revoked_at: null,
      });

      store.auditLogs.unshift({
        id: randomHex(8),
        actor_username: sess.admin.username,
        action: 'LICENSE_CREATED',
        entity_type: 'Licenses',
        entity_id: id,
        timestamp: nowIso,
      });

      saveLocalStore(store);

      return {
        license: {
          id,
          code, // Shown ONLY once at creation
          code_prefix: prefix,
          client_reference: cleanRef,
          status: 'available',
          created_at: nowIso,
        },
      };
    }

    if (pathname === '/api/admin/licenses/revoke' && body !== undefined) {
      const target = store.licenses.find((l) => l.id === body.license_id);
      if (!target) throw new Error('Licencia no encontrada.');
      if (target.status === 'revoked') {
        throw new Error('La licencia ya se encuentra revocada.');
      }
      const nowIso = new Date().toISOString();
      target.status = 'revoked';
      target.revoked_at = nowIso;
      target.installation_credential_hash = null;

      store.auditLogs.unshift({
        id: randomHex(8),
        actor_username: sess.admin.username,
        action: 'LICENSE_REVOKED',
        entity_type: 'Licenses',
        entity_id: target.id,
        timestamp: nowIso,
      });

      saveLocalStore(store);
      return { license: { id: target.id, status: 'revoked' } };
    }

    if (pathname === '/api/admin/licenses/replace' && body !== undefined) {
      const oldLic = store.licenses.find((l) => l.id === body.license_id);
      if (!oldLic) throw new Error('Licencia no encontrada.');
      if (oldLic.status !== 'available') {
        throw new Error(
          'Solo se puede reemplazar un código que aún no haya sido activado ni revocado.',
        );
      }
      const nowIso = new Date().toISOString();
      oldLic.status = 'revoked';
      oldLic.revoked_at = nowIso;

      const { code, prefix, codeHash } = generateSignedLicenseCode();
      const newId = `lic_${randomHex(8)}`;
      store.licenses.unshift({
        id: newId,
        code_hash: codeHash,
        code_prefix: prefix,
        client_reference: oldLic.client_reference,
        status: 'available',
        created_at: nowIso,
        activated_at: null,
        installation_id: null,
        created_by_username: sess.admin.username,
        revoked_at: null,
      });

      store.auditLogs.unshift({
        id: randomHex(8),
        actor_username: sess.admin.username,
        action: 'LICENSE_REPLACED_LOST_CODE',
        entity_type: 'Licenses',
        entity_id: newId,
        timestamp: nowIso,
      });

      saveLocalStore(store);
      return {
        invalidated_id: oldLic.id,
        replacement: {
          id: newId,
          code,
          code_prefix: prefix,
          client_reference: oldLic.client_reference,
          status: 'available',
          created_at: nowIso,
        },
      };
    }

    throw new Error('Operación administrativa no disponible.');
  }

  async function adminApi(path, body) {
    if (staticMode) {
      return localAdminApi(path, body);
    }
    const options = {
      method: body !== undefined ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {},
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      if (csrfToken) {
        options.headers['X-CSRF-Token'] = csrfToken;
      }
      options.body = JSON.stringify(body);
    }
    try {
      const res = await fetch(path, options);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        staticMode = true;
        return localAdminApi(path, body);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(
          data.error || 'Error en la operación administrativa.',
        );
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      if (err && err.status) throw err;
      staticMode = true;
      return localAdminApi(path, body);
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-AR');
    } catch {
      return iso;
    }
  }

  function statusLabel(status) {
    if (status === 'available') return 'Disponible';
    if (status === 'activated') return 'Activada';
    if (status === 'revoked') return 'Revocada';
    return status;
  }

  function renderLicensesTable(licenses) {
    const tbody = $('licenses-tbody');
    if (!tbody) return;
    if (!licenses.length) {
      const tr = el('tr');
      const td = el('td', 'No se encontraron licencias para este filtro.');
      td.colSpan = 7;
      tr.append(td);
      tbody.replaceChildren(tr);
      return;
    }

    tbody.replaceChildren(
      ...licenses.map((lic) => {
        const tr = el('tr');
        tr.append(
          el('td', lic.code_prefix),
          el('td', lic.client_reference || 'Sin referencia'),
        );
        const statusTd = el('td');
        statusTd.append(
          el(
            'span',
            statusLabel(lic.status),
            `status-pill status-${lic.status}`,
          ),
        );
        tr.append(
          statusTd,
          el('td', formatDate(lic.created_at)),
          el('td', formatDate(lic.activated_at)),
          el('td', lic.installation_id || '—'),
        );

        const actionsTd = el('td', undefined, 'admin-actions-cell');
        if (lic.status === 'available') {
          const replaceBtn = el(
            'button',
            'Reemplazar extraviado',
            'admin-btn-small',
          );
          replaceBtn.type = 'button';
          replaceBtn.dataset.action = 'replace';
          replaceBtn.dataset.id = lic.id;
          actionsTd.append(replaceBtn);
        }
        if (lic.status !== 'revoked') {
          const revokeBtn = el(
            'button',
            'Revocar',
            'admin-btn-small admin-btn-danger',
          );
          revokeBtn.type = 'button';
          revokeBtn.dataset.action = 'revoke';
          revokeBtn.dataset.id = lic.id;
          actionsTd.append(revokeBtn);
        }
        tr.append(actionsTd);
        return tr;
      }),
    );
  }

  function renderLogs(auditLogs, activations) {
    const auditContainer = $('audit-logs-list');
    if (auditContainer) {
      auditContainer.replaceChildren(
        ...(auditLogs.length
          ? auditLogs.map((item) => {
              const box = el('div', undefined, 'admin-log-item');
              box.append(
                el(
                  'strong',
                  `${item.action} · ${formatDate(item.timestamp)}`,
                ),
                el(
                  'div',
                  `Actor: ${item.actor_username || 'Sistema'} · Entidad: ${item.entity_type}`,
                ),
              );
              return box;
            })
          : [el('p', 'Sin eventos registrados.')]),
      );
    }

    const actContainer = $('activations-logs-list');
    if (actContainer) {
      actContainer.replaceChildren(
        ...(activations.length
          ? activations.map((item) => {
              const box = el('div', undefined, 'admin-log-item');
              box.append(
                el(
                  'strong',
                  `${item.activation_result} · ${formatDate(item.activated_at)}`,
                ),
                el('div', `Instalación: ${item.installation_id}`),
              );
              return box;
            })
          : [el('p', 'Sin intentos de activación registrados.')]),
      );
    }
  }

  async function refreshAdminData() {
    const search = $('filter-search')?.value || '';
    const status = $('filter-status')?.value || '';
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    const query = params.toString() ? `?${params.toString()}` : '';
    const data = await adminApi(`/api/admin/licenses${query}`);
    $('stat-total').textContent = String(data.stats.total);
    $('stat-available').textContent = String(data.stats.available);
    $('stat-activated').textContent = String(data.stats.activated);
    $('stat-revoked').textContent = String(data.stats.revoked);
    renderLicensesTable(data.licenses);
    renderLogs(data.auditLogs, data.activations);
  }

  function showAdminView(admin) {
    $('admin-login-section').hidden = true;
    $('admin-dashboard-section').hidden = false;
    $('admin-header-user').hidden = false;
    $('admin-user-badge').textContent = `${admin.username} (${admin.role})`;
  }

  function showLoginView() {
    $('admin-login-section').hidden = false;
    $('admin-dashboard-section').hidden = true;
    $('admin-header-user').hidden = true;
    $('created-code-box').hidden = true;
    $('created-code-value').textContent = '';
  }

  function revealOneTimeCode(code) {
    $('created-code-value').textContent = code;
    $('created-code-box').hidden = false;
    $('copy-code-status').textContent = '';
  }

  function setupStaticExportLinks() {
    const exportLinks = document.querySelectorAll('a[href*="/api/admin/licenses/export"]');
    exportLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        if (!staticMode) return;
        event.preventDefault();
        const isCsv = link.href.includes('format=csv');
        const store = loadLocalStore();
        const sanitized = store.licenses.map((l) => ({
          id: l.id,
          code_prefix: l.code_prefix,
          client_reference: l.client_reference || '',
          status: l.status,
          created_at: l.created_at,
          activated_at: l.activated_at || '',
          installation_id: l.installation_id || '',
          created_by_username: l.created_by_username || 'Sheila',
          revoked_at: l.revoked_at || '',
        }));
        let content = '';
        let mime = 'application/json;charset=utf-8';
        let filename = 'licencias-metodo-judicial.json';
        if (isCsv) {
          const headers = [
            'id',
            'code_prefix',
            'client_reference',
            'status',
            'created_at',
            'activated_at',
            'installation_id',
            'created_by_username',
            'revoked_at',
          ];
          const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          content = [
            headers.join(','),
            ...sanitized.map((r) => headers.map((h) => esc(r[h])).join(',')),
          ].join('\n');
          mime = 'text/csv;charset=utf-8';
          filename = 'licencias-metodo-judicial.csv';
        } else {
          content = JSON.stringify({ licenses: sanitized }, null, 2);
        }
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const tempA = document.createElement('a');
        tempA.href = url;
        tempA.download = filename;
        document.body.appendChild(tempA);
        tempA.click();
        tempA.remove();
        URL.revokeObjectURL(url);
      });
    });
  }

  async function initializeAdminPanel() {
    setupStaticExportLinks();
    try {
      const session = await adminApi('/api/admin/session');
      if (session.authenticated) {
        csrfToken = session.csrf;
        showAdminView(session.admin);
        await refreshAdminData();
      } else {
        showLoginView();
      }
    } catch {
      showLoginView();
    }
  }

  $('admin-login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = $('admin-username').value.trim();
    const password = $('admin-password').value;
    const msg = $('admin-login-message');
    const btn = $('admin-login-submit');
    btn.disabled = true;
    msg.textContent = 'Verificando credenciales…';
    try {
      const res = await adminApi('/api/admin/login', { username, password });
      csrfToken = res.csrf;
      $('admin-login-form').reset();
      msg.textContent = '';
      showAdminView(res.admin);
      await refreshAdminData();
    } catch (err) {
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('admin-logout-btn')?.addEventListener('click', async () => {
    try {
      await adminApi('/api/admin/logout', {});
    } finally {
      csrfToken = '';
      showLoginView();
    }
  });

  $('create-license-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const refInput = $('client-reference-input');
    const btn = $('create-license-btn');
    btn.disabled = true;
    try {
      const res = await adminApi('/api/admin/licenses/create', {
        client_reference: refInput.value.trim(),
      });
      refInput.value = '';
      revealOneTimeCode(res.license.code);
      $('admin-action-feedback').textContent =
        `Licencia creada (${res.license.code_prefix}). Entregá el código generado por única vez.`;
      await refreshAdminData();
    } catch (err) {
      $('admin-action-feedback').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('copy-code-btn')?.addEventListener('click', async () => {
    const code = $('created-code-value').textContent;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      $('copy-code-status').textContent = '¡Código copiado al portapapeles!';
    } catch {
      $('copy-code-status').textContent =
        'Seleccioná y copiá el código manualmente.';
    }
  });

  $('filter-licenses-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await refreshAdminData();
    } catch (err) {
      $('admin-action-feedback').textContent = err.message;
    }
  });

  $('licenses-tbody')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const licenseId = button.dataset.id;
    button.disabled = true;
    try {
      if (action === 'revoke') {
        await adminApi('/api/admin/licenses/revoke', {
          license_id: licenseId,
          reason: 'Revocación administrativa desde el panel',
        });
        $('admin-action-feedback').textContent =
          'Licencia revocada y registrada en auditoría.';
      } else if (action === 'replace') {
        const res = await adminApi('/api/admin/licenses/replace', {
          license_id: licenseId,
        });
        revealOneTimeCode(res.replacement.code);
        $('admin-action-feedback').textContent =
          `Código anterior invalidado. Nuevo código emitido (${res.replacement.code_prefix}).`;
      }
      await refreshAdminData();
    } catch (err) {
      $('admin-action-feedback').textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });

  initializeAdminPanel();
})();
