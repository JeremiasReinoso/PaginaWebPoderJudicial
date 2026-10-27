import { api } from './api.js';
import { byId, element, message } from './dom.js';
import { showSection } from './navigation.js';
import { modeName, refreshDashboard, showExamResult } from './results.js';
let exam,
  busy = false;
function questionField(question, index) {
  const field = element('fieldset', undefined, 'question');
  field.append(element('legend', `${index + 1}. ${question.question}`));
  question.options.forEach((text, option) => {
    const label = element('label', undefined, 'option');
    const input = element('input');
    input.type = 'radio';
    input.name = question.id;
    input.value = String(option);
    input.required = true;
    label.append(input, element('span', text));
    field.append(label);
  });
  return field;
}
async function startExam(mode) {
  if (busy) return;
  busy = true;
  try {
    exam = await api('/api/exams/start', { mode });
    document.dispatchEvent(new Event('campus:exam-started'));
    showSection('exam-panel');
    byId('exam-title').textContent =
      mode === 'reading' ? exam.title : modeName(mode);
    byId('exam-result').replaceChildren();
    byId('exam-form').hidden = false;
    byId('reading-another').hidden = mode !== 'reading';
    byId('exam-passage-meta').hidden = !exam.passage;
    byId('exam-passage-meta').textContent = exam.passage
      ? `${exam.topic} · ${exam.wordCount} palabras · Texto original de práctica. Elegir otra lectura reinicia las respuestas.`
      : '';
    byId('exam-passage').hidden = !exam.passage;
    byId('exam-passage').textContent = exam.passage || '';
    byId('exam-questions').replaceChildren(
      ...exam.questions.map(questionField),
    );
    byId('exam-panel').scrollIntoView({ behavior: 'auto', block: 'start' });
    message(
      'Prueba iniciada. Iniciar otra práctica reemplaza el intento pendiente.',
    );
  } catch (error) {
    message(error.message, true);
  } finally {
    busy = false;
  }
}
async function submitExam(event) {
  event.preventDefault();
  if (busy || !exam) return;
  busy = true;
  const button = event.target.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    const answers = Object.fromEntries(
      [...new FormData(event.target)].map(([key, value]) => [
        key,
        Number(value),
      ]),
    );
    const result = await api('/api/exams/submit', {
      attempt: exam.attempt,
      answers,
    });
    byId('exam-form').hidden = true;
    showExamResult(result);
    await refreshDashboard();
    message('Resultado corregido y guardado en tu acceso.');
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
    busy = false;
  }
}
export function initializeExams() {
  document.addEventListener('click', (event) => {
    const start = event.target.closest('[data-exam]');
    if (start) startExam(start.dataset.exam);
  });
  byId('exam-back').addEventListener('click', () => showSection('study'));
  byId('exam-form').addEventListener('submit', submitExam);
}
