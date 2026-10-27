/** Protected administrative frontend module for license lifecycle management. */
let csrfToken = '';

const $ = (id) => document.getElementById(id);

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

async function adminApi(path, body) {
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
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Error en la operación administrativa.');
    err.status = res.status;
    throw err;
  }
  return data;
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

async function initializeAdminPanel() {
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
    $('copy-code-status').textContent = 'Seleccioná y copiá el código manualmente.';
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
