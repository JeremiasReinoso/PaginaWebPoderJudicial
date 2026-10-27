import { clientApi } from './client_backend.js';

let csrf = '';
let staticMode = false;

export function loginPageUrl() {
  if (staticMode) {
    return new URL('../access.html', location.href).href;
  }
  return '/ingreso';
}

export async function api(path, body) {
  if (staticMode) {
    try {
      return await clientApi(path, body);
    } catch (err) {
      if (err && err.status === 401) {
        location.replace(loginPageUrl());
        throw new Error('Volvé a ingresar.');
      }
      throw err;
    }
  }
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
    location.replace(loginPageUrl());
    throw new Error('Volvé a ingresar.');
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}

export async function initializeSession() {
  try {
    const response = await fetch('/api/session', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) {
      const session = await response.json();
      if (session.authenticated) {
        staticMode = false;
        csrf = session.csrf;
        return true;
      }
      const fallback = await clientApi('/api/session');
      if (fallback.authenticated) {
        staticMode = true;
        csrf = fallback.csrf;
        return true;
      }
      location.replace('/ingreso');
      return false;
    }
  } catch {
    // Static environment without server endpoint
  }
  staticMode = true;
  const session = await clientApi('/api/session');
  if (!session.authenticated) {
    location.replace(loginPageUrl());
    return false;
  }
  csrf = session.csrf;
  return true;
}
