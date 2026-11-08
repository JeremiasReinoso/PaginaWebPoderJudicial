/**
 * Panel Administrativo de Licencias — Modo 100% independiente y estático para navegador,
 * con compatibilidad hacia servidor local (/api/admin/*) si estuviese disponible.
 */
(() => {
  if (window.__MJ_ADMIN_PANEL_INIT__) return;
  window.__MJ_ADMIN_PANEL_INIT__ = true;

  const STORAGE_KEY = 'mj_judicial_license_store_v1';
  const SESSION_KEY = 'mj_judicial_admin_session_v1';

  let csrfToken = '';
  let staticMode =
    location.protocol === 'file:' ||
    location.hostname.endsWith('github.io') ||
    !location.port ||
    location.port === '5500';

  const $ = (id) => document.getElementById(id);

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  function randomHex(length) {
    const hex = '0123456789ABCDEF';
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += hex[Math.floor(Math.random() * 16)];
    }
    return out;
  }

  function computePanelSignature(hex32) {
    let h1 = 0x811c9dc5;
    let h2 = 0x1b873593;
    const input = `PJ_MZA_2026_PANEL_${String(hex32).toUpperCase()}`;
    for (let i = 0; i < input.length; i += 1) {
      const c = input.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= c + i;
      h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    const s1 = ((h1 >>> 0) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
    const s2 = ((h2 >>> 0) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
    return `${s1}${s2}`;
  }

  function generateLicenseCode() {
    const bodyHex = randomHex(32);
    const sigHex = computePanelSignature(bodyHex);
    const hex = `${bodyHex}${sigHex}`;
    const groups = [];
    for (let i = 0; i < hex.length; i += 4) {
      groups.push(hex.slice(i, i + 4));
    }
    const code = `PJ-${groups.join('-')}`;
    const prefix = `PJ-${groups[0]}-${groups[1]}`;
    return { code, prefix, clean: `PJ${hex}` };
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

  function calcPair(str) {
    let a = 0x811c9dc5;
    let b = 0x9e3779b9;
    for (let i = 0; i < str.length; i += 1) {
      const c = str.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193) >>> 0;
      b = Math.imul(b ^ (c + i * 31), 0x85ebca6b) >>> 0;
    }
    return [a >>> 0, b >>> 0];
  }

  function isValidAdminCredential(rawUser, rawPass) {
    const u = String(rawUser || '').trim().toLowerCase().normalize('NFC');
    const p = String(rawPass || '').trim().normalize('NFC');
    const [u1, u2] = calcPair(u);
    const [p1, p2] = calcPair(p);
    const [pl1, pl2] = calcPair(p.toLowerCase());
    const userOk = u1 === 792006191 && u2 === 989308958;
    const passOk =
      (p1 === 459838305 && p2 === 3132151840) ||
      (pl1 === 3895706433 && pl2 === 1581517760);
    return userOk && passOk;
  }

  function localAdminApi(path, body) {
    const store = loadLocalStore();
    const pathname = path.split('?')[0];

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
      const rawUser = String(body.username || '').trim();
      const rawPass = String(body.password || '');

      if (!rawUser || !rawPass) {
        throw new Error('Ingresá usuario y contraseña administrativos.');
      }

      if (!isValidAdminCredential(rawUser, rawPass)) {
        throw new Error('Credenciales administrativas inválidas.');
      }

      const displayUser = 'administrador';
      const sess = {
        csrf: randomHex(16),
        admin: {
          id: 'admin-panel-2026',
          username: displayUser,
          role: 'admin',
        },
      };
      setLocalSession(sess);

      store.auditLogs.unshift({
        id: randomHex(8),
        actor_username: displayUser,
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
      const searchParams = new URLSearchParams(
        path.includes('?') ? path.split('?')[1] : '',
      );
      const statusFilter = searchParams.get('status') || '';
      const searchFilter = (searchParams.get('search') || '')
        .trim()
        .toLowerCase();

      const stats = { total: 0, available: 0, activated: 0, revoked: 0 };
      for (const lic of store.licenses) {
        stats.total += 1;
        if (stats[lic.status] !== undefined) stats[lic.status] += 1;
      }

      const filtered = store.licenses.filter((lic) => {
        const prefix = lic.code_prefix || lic.prefix || '';
        const ref = lic.client_reference || lic.client || '';
        const inst = lic.installation_id || lic.installationId || '';
        if (statusFilter && lic.status !== statusFilter) return false;
        if (searchFilter) {
          const hay = `${prefix} ${ref} ${inst}`.toLowerCase();
          if (!hay.includes(searchFilter)) return false;
        }
        return true;
      });

      const safeLicenses = filtered.map((lic) => ({
        id: lic.id,
        code_prefix: lic.code_prefix || lic.prefix || 'PJ-XXXX',
        client_reference: lic.client_reference || lic.client || null,
        status: lic.status,
        created_at: lic.created_at || lic.createdAt,
        activated_at: lic.activated_at || lic.activatedAt || null,
        installation_id: lic.installation_id || lic.installationId || null,
        created_by_username: lic.created_by_username || 'administrador',
        revoked_at: lic.revoked_at || null,
      }));

      return {
        stats,
        licenses: safeLicenses,
        auditLogs: store.auditLogs.slice(0, 50),
        activations: store.activations.slice(0, 50),
      };
    }

    if (pathname === '/api/admin/licenses/create' && body !== undefined) {
      const rawName = body.client_reference ?? body.person_name ?? '';
      const cleanRef =
        typeof rawName === 'string' && rawName.trim()
          ? rawName.trim().slice(0, 120)
          : null;
      const { code, prefix, clean } = generateLicenseCode();
      const nowIso = new Date().toISOString();
      const id = `lic_${randomHex(8).toLowerCase()}`;

      store.licenses.unshift({
        id,
        code: clean,
        clean,
        fullCode: code,
        code_prefix: prefix,
        prefix,
        client_reference: cleanRef,
        client: cleanRef,
        status: 'available',
        created_at: nowIso,
        createdAt: nowIso,
        activated_at: null,
        activatedAt: null,
        installation_id: null,
        installationId: null,
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
          code,
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
      target.installation_credential = null;

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

      const { code, prefix, clean } = generateLicenseCode();
      const newId = `lic_${randomHex(8).toLowerCase()}`;
      const ref = oldLic.client_reference || oldLic.client || null;
      store.licenses.unshift({
        id: newId,
        code: clean,
        clean,
        fullCode: code,
        code_prefix: prefix,
        prefix,
        client_reference: ref,
        client: ref,
        status: 'available',
        created_at: nowIso,
        createdAt: nowIso,
        activated_at: null,
        activatedAt: null,
        installation_id: null,
        installationId: null,
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
          client_reference: ref,
          status: 'available',
          created_at: nowIso,
        },
      };
    }

    throw new Error('Operación no disponible.');
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
        if (
          path === '/api/admin/login' &&
          body &&
          isValidAdminCredential(body.username, body.password)
        ) {
          staticMode = true;
          return localAdminApi(path, body);
        }
        const err = new Error(
          data.error || 'Error en la operación administrativa.',
        );
        err.status = res.status;
        throw err;
      }
      // Sincronizar también en localStorage cuando se crea o revoca en servidor local
      if (path === '/api/admin/licenses/create' && data.license?.code) {
        try {
          const store = loadLocalStore();
          const cleaned = data.license.code.replace(/[-\s]/g, '').toUpperCase();
          store.licenses.unshift({
            id: data.license.id,
            code: cleaned,
            clean: cleaned,
            fullCode: data.license.code,
            code_prefix: data.license.code_prefix,
            prefix: data.license.code_prefix,
            client_reference: data.license.client_reference,
            status: 'available',
            created_at: data.license.created_at,
            activated_at: null,
            installation_id: null,
            created_by_username: 'administrador',
            revoked_at: null,
          });
          saveLocalStore(store);
        } catch {}
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
          el('td', lic.client_reference || 'Sin nombre'),
        );
        const statusTd = el('td');
        statusTd.append(
          el('span', statusLabel(lic.status), `status-pill status-${lic.status}`),
        );
        tr.append(
          statusTd,
          el('td', formatDate(lic.created_at)),
          el('td', formatDate(lic.activated_at)),
          el('td', lic.installation_id || '—'),
        );

        const actionsTd = el('td', undefined, 'admin-actions-cell');
        if (lic.status === 'available') {
          const replaceBtn = el('button', 'Reemplazar', 'admin-btn-small');
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
                el('strong', `${item.action} · ${formatDate(item.timestamp)}`),
                el(
                  'div',
                  `Actor: ${item.actor_username || 'Sistema'} · Entidad: ${item.entity_type || 'Licenses'}`,
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
                  `${item.activation_result || 'activated'} · ${formatDate(item.activated_at || item.activatedAt)}`,
                ),
                el(
                  'div',
                  `Instalación: ${item.installation_id || item.installationId || '—'}`,
                ),
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
    if ($('created-code-box')) $('created-code-box').hidden = true;
    if ($('created-code-value')) $('created-code-value').textContent = '';
  }

  function revealOneTimeCode(code) {
    $('created-code-value').textContent = code;
    $('created-code-box').hidden = false;
    $('copy-code-status').textContent = '';
  }

  function setupStaticExportLinks() {
    const exportLinks = document.querySelectorAll(
      'a[href*="/api/admin/licenses/export"]',
    );
    exportLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        if (!staticMode) return;
        event.preventDefault();
        const isCsv = link.href.includes('format=csv');
        const store = loadLocalStore();
        const sanitized = store.licenses.map((l) => ({
          id: l.id,
          code_prefix: l.code_prefix || l.prefix || '',
          client_reference: l.client_reference || l.client || '',
          status: l.status,
          created_at: l.created_at || l.createdAt || '',
          activated_at: l.activated_at || l.activatedAt || '',
          installation_id: l.installation_id || l.installationId || '',
          created_by_username: l.created_by_username || 'administrador',
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
      if (session && session.authenticated) {
        csrfToken = session.csrf || '';
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
      csrfToken = res.csrf || '';
      $('admin-login-form').reset();
      msg.textContent = '';
      showAdminView(res.admin);
      await refreshAdminData();
    } catch (err) {
      msg.textContent = err.message || 'Credenciales inválidas.';
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
    if (btn) btn.disabled = true;
    try {
      const res = await adminApi('/api/admin/licenses/create', {
        client_reference: refInput.value.trim(),
        person_name: refInput.value.trim(),
      });
      refInput.value = '';
      revealOneTimeCode(res.license.code);
      $('admin-action-feedback').textContent =
        `Licencia creada (${res.license.code_prefix}). Entregá el código generado por única vez.`;
      await refreshAdminData();
    } catch (err) {
      $('admin-action-feedback').textContent = err.message;
    } finally {
      if (btn) btn.disabled = false;
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
        $('admin-action-feedback').textContent = 'Licencia revocada.';
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
