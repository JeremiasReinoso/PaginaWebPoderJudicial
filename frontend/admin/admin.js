/* Panel administrativo: todas las operaciones pasan por el backend protegido. */
(() => {
  let csrfToken = '';
  const $ = (id) => document.getElementById(id);
  const date = (value) => value ? new Date(value).toLocaleString('es-AR') : '—';
  const value = (input) => String(input ?? '—');

  async function api(path, body) {
    const options = { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.headers['X-CSRF-Token'] = csrfToken; options.body = JSON.stringify(body); }
    const response = await fetch(path, options); const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.'); return data;
  }
  const statusLabel = (status) => ({ available: 'Disponible', activated: 'Activada', revoked: 'Revocada' }[status] || status);
  function showCode(code) { $('created-code-value').textContent = code; $('created-code-box').hidden = false; $('copy-code-status').textContent = ''; }
  function render(licenses) {
    const tbody = $('licenses-tbody');
    const rows = licenses.length ? licenses.map((license) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${value(license.code_prefix)}</td><td>${value(license.client_reference || 'Sin nombre')}</td><td><span class="status-pill status-${license.status}">${statusLabel(license.status)}</span></td><td>${date(license.created_at)}</td><td>${date(license.activated_at)}</td><td>${value(license.installation_id)}</td><td></td>`;
      const actions = row.lastElementChild;
      if (license.status === 'available') { const button = document.createElement('button'); button.className = 'admin-btn-small'; button.textContent = 'Reemplazar'; button.onclick = () => action('/api/admin/licenses/replace', { license_id: license.id }, 'Código reemplazado.'); actions.append(button); }
      if (license.status !== 'revoked') { const button = document.createElement('button'); button.className = 'admin-btn-small admin-btn-danger'; button.textContent = 'Revocar'; button.onclick = () => action('/api/admin/licenses/revoke', { license_id: license.id, reason: 'Revocación desde el panel' }, 'Licencia revocada.'); actions.append(button); }
      return row;
    }) : [(() => { const row = document.createElement('tr'); row.innerHTML = '<td colspan="7">No se encontraron licencias.</td>'; return row; })()];
    tbody.replaceChildren(...rows);
  }
  function logs(logs, activations) {
    $('audit-logs-list').replaceChildren(...(logs.length ? logs.map((item) => { const p = document.createElement('p'); p.className = 'admin-log-item'; p.textContent = `${item.action} · ${date(item.timestamp)} · ${item.actor_username || 'Sistema'}`; return p; }) : [document.createTextNode('Sin eventos registrados.')]));
    $('activations-logs-list').replaceChildren(...(activations.length ? activations.map((item) => { const p = document.createElement('p'); p.className = 'admin-log-item'; p.textContent = `${item.activation_result} · ${date(item.activated_at)} · ${item.installation_id}`; return p; }) : [document.createTextNode('Sin intentos registrados.')]));
  }
  async function refresh() {
    const query = new URLSearchParams(); if ($('filter-status').value) query.set('status', $('filter-status').value); if ($('filter-search').value) query.set('search', $('filter-search').value);
    const data = await api(`/api/admin/licenses?${query}`); Object.entries(data.stats).forEach(([key, count]) => { if ($(`stat-${key}`)) $(`stat-${key}`).textContent = count; }); render(data.licenses); logs(data.auditLogs, data.activations);
  }
  async function action(path, body, message) { try { const result = await api(path, body); $('admin-action-feedback').textContent = message; if (result.replacement?.code) showCode(result.replacement.code); await refresh(); } catch (error) { $('admin-action-feedback').textContent = error.message; } }
  function dashboard(admin) { $('admin-login-section').hidden = true; $('admin-dashboard-section').hidden = false; $('admin-header-user').hidden = false; $('admin-user-badge').textContent = `${admin.username} (${admin.role})`; }
  function loginView() { $('admin-login-section').hidden = false; $('admin-dashboard-section').hidden = true; $('admin-header-user').hidden = true; }

  $('admin-login-form').addEventListener('submit', async (event) => { event.preventDefault(); const message = $('admin-login-message'); const button = $('admin-login-submit'); button.disabled = true; message.textContent = 'Verificando…'; try { const data = await api('/api/admin/login', { username: $('admin-username').value, password: $('admin-password').value }); csrfToken = data.csrf; event.target.reset(); message.textContent = ''; dashboard(data.admin); await refresh(); } catch (error) { message.textContent = error.message; } finally { button.disabled = false; } });
  $('admin-logout-btn').addEventListener('click', async () => { try { await api('/api/admin/logout', {}); } finally { csrfToken = ''; loginView(); } });
  $('create-license-form').addEventListener('submit', async (event) => { event.preventDefault(); const input = $('client-reference-input'); await action('/api/admin/licenses/create', { person_name: input.value.trim() }, 'Licencia creada. Entregá el código mostrado una sola vez.'); input.value = ''; });
  $('copy-code-btn').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('created-code-value').textContent); $('copy-code-status').textContent = 'Código copiado.'; } catch { $('copy-code-status').textContent = 'Copialo manualmente.'; } });
  $('filter-licenses-form').addEventListener('submit', (event) => { event.preventDefault(); refresh().catch((error) => { $('admin-action-feedback').textContent = error.message; }); });
  api('/api/admin/session').then(async (session) => { if (!session.authenticated) return loginView(); csrfToken = session.csrf; dashboard(session.admin); await refresh(); }).catch(loginView);
})();
