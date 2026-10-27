let csrf = '';
export async function api(path, body) {
  const options = { credentials: 'same-origin', cache: 'no-store' };
  if (body !== undefined) {
    options.method = 'POST';
    options.headers = {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  if (response.status === 401) {
    location.replace('/ingreso');
    throw new Error('Volvé a ingresar.');
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}
export async function initializeSession() {
  const session = await api('/api/session');
  if (!session.authenticated) {
    location.replace('/ingreso');
    return false;
  }
  csrf = session.csrf;
  return true;
}
