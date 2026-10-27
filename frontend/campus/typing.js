import { api } from './api.js';
import { byId, element, message } from './dom.js';
import { refreshDashboard } from './results.js';
let attempt,
  timer,
  started,
  busy = false;
function stopTyping() {
  clearInterval(timer);
  attempt = null;
  byId('typing-input').disabled = true;
  byId('typing-finish').disabled = true;
}
async function startTyping() {
  if (busy) return;
  busy = true;
  try {
    const data = await api('/api/typing/start', {});
    clearInterval(timer);
    attempt = data.attempt;
    byId('typing-source').textContent = data.text;
    byId('typing-title').textContent = data.title;
    byId('typing-meta').textContent =
      `${data.topic} · ${data.wordCount} palabras · ${data.text.length} caracteres`;
    byId('typing-start').textContent = 'Iniciar otro texto aleatorio';
    byId('typing-input').value = '';
    byId('typing-input').disabled = false;
    byId('typing-finish').disabled = false;
    byId('typing-result').replaceChildren();
    byId('typing-count').textContent = '0';
    byId('typing-time').textContent = '0:00';
    started = performance.now();
    timer = setInterval(() => {
      const seconds = Math.floor((performance.now() - started) / 1000);
      byId('typing-time').textContent =
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }, 250);
    byId('typing-input').focus();
    message(
      'Cronómetro iniciado. El tiempo definitivo se calcula en el servidor.',
    );
  } catch (error) {
    message(error.message, true);
  } finally {
    busy = false;
  }
}
async function finishTyping() {
  if (busy || !attempt) return;
  const text = byId('typing-input').value;
  if (!text.length)
    return message('Escribí al menos un carácter para puntuar.', true);
  busy = true;
  try {
    const result = await api('/api/typing/submit', { attempt, text });
    stopTyping();
    const card = element('div', undefined, 'result-card');
    card.append(
      element('h3', `${result.accuracy}% de precisión`),
      element(
        'p',
        `${result.seconds} segundos · ${result.wpm} palabras correctas por minuto.`,
      ),
      element(
        'p',
        result.completed
          ? 'Texto completo y exacto.'
          : 'Podés repetir para mejorar precisión y completar el texto.',
      ),
      element('p', result.note),
    );
    byId('typing-result').replaceChildren(card);
    await refreshDashboard();
    message('Práctica de mecanografía guardada.');
  } catch (error) {
    message(error.message, true);
  } finally {
    busy = false;
  }
}
export async function loadTypingPreview() {
  const data = await api('/api/typing');
  byId('typing-source').textContent = data.text;
}
export function initializeTyping() {
  byId('typing-start').addEventListener('click', startTyping);
  byId('typing-finish').addEventListener('click', finishTyping);
  byId('typing-input').addEventListener('input', () => {
    byId('typing-count').textContent = String(
      byId('typing-input').value.length,
    );
  });
  for (const event of ['paste', 'drop']) {
    byId('typing-input').addEventListener(event, (action) =>
      action.preventDefault(),
    );
  }
  document.addEventListener('campus:exam-started', stopTyping);
}
