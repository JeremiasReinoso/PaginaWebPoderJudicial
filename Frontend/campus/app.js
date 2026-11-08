import { api, initializeSession, loginPageUrl } from './api.js';
import { byId, message } from './dom.js';
import { initializeNavigation } from './navigation.js';
import { initializeExams } from './exams.js';
import { initializeTyping, loadTypingPreview } from './typing.js';
import { refreshDashboard } from './results.js';
import './library.js';

async function initializeCampus() {
  try {
    if (!(await initializeSession())) return;
    initializeNavigation();
    initializeExams();
    initializeTyping();
    await refreshDashboard();
    await loadTypingPreview();
    message('Sesión verificada. Acceso de prueba local habilitado.');
  } catch (error) {
    message(error.message, true);
  }
}
byId('logout').addEventListener('click', async () => {
  try {
    await api('/api/logout', {});
    location.replace(loginPageUrl());
  } catch (error) {
    message(error.message, true);
  }
});
window.addEventListener('pageshow', async (event) => {
  if (!event.persisted) return;
  try {
    await initializeSession();
  } catch (error) {
    message(error.message, true);
  }
});
initializeCampus();
