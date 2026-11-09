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
function writingField(question, index) {
  const field = element('fieldset', undefined, 'question');
  field.append(
    element('legend', `Respuesta escrita ${index + 1}. ${question.question}`),
  );
  const input = element('textarea');
  input.name = question.id;
  input.rows = 6;
  input.maxLength = 3000;
  input.required = true;
  input.setAttribute('aria-label', `Respuesta escrita ${index + 1}`);
  input.lang = 'es-AR';
  input.spellcheck = true;
  field.append(
    input,
    element(
      'p',
      'Entre 40 y 150 palabras. Al entregar verás sugerencias para mejorar tu escritura y una guía de autoevaluación.',
    ),
  );
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
      ...(exam.writingQuestions || []).map(writingField),
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
    const form = new FormData(event.target);
    const answers = Object.fromEntries(
      exam.questions.map((q) => [q.id, Number(form.get(q.id))]),
    );
    const writtenAnswers = exam.writingQuestions
      ? Object.fromEntries(
          exam.writingQuestions.map((q) => [q.id, String(form.get(q.id) || '')]),
        )
      : undefined;
    if (
      writtenAnswers &&
      Object.values(writtenAnswers).some((text) => {
        const count = text.trim().split(/\s+/).length;
        return count < 40 || count > 150;
      })
    ) {
      throw new Error(
        'Cada respuesta escrita debe tener entre 40 y 150 palabras.',
      );
    }
    const result = await api('/api/exams/submit', {
      attempt: exam.attempt,
      answers,
      ...(writtenAnswers ? { writtenAnswers } : {}),
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
