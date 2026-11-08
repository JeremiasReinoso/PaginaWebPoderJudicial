import { api } from './api.js';
import { byId, element } from './dom.js';
import { CHECKLIST } from './writing.js';
let moduleTitles = [];
export function modeName(mode) {
  if (mode === 'final') return 'Integrador de prueba';
  if (mode === 'reading') return 'Comprensión lectora';
  if (mode === 'typing') return 'Mecanografía';
  return moduleTitles[Number(mode.split('-')[1]) - 1] || 'Práctica';
}
function moduleCard(title, index) {
  const card = element('article', undefined, 'tool-card');
  card.append(
    element('span', `Módulo 0${index + 1}`, 'eyebrow'),
    element('h3', title),
    element('p', 'Prueba breve de 4 preguntas.'),
  );
  const button = element('button', 'Probar examen', 'button');
  button.dataset.exam = `module-${index + 1}`;
  card.append(button);
  return card;
}
export async function refreshDashboard() {
  const dashboard = await api('/api/dashboard');
  moduleTitles = dashboard.modules;
  byId('account-name').textContent = dashboard.displayName;
  byId('achievements').replaceChildren(
    ...moduleTitles.map((_, index) => {
      const earned = dashboard.achievements.includes(`module-${index + 1}`);
      const badge = element(
        'span',
        String(index + 1).padStart(2, '0'),
        `achievement${earned ? ' earned' : ''}`,
      );
      badge.setAttribute(
        'aria-label',
        `Módulo ${index + 1}: ${earned ? 'logro obtenido' : 'pendiente'}`,
      );
      return badge;
    }),
  );
  byId('module-tests').replaceChildren(...moduleTitles.map(moduleCard));
  byId('campus-notices').replaceChildren(
    ...dashboard.notices.map((text) => element('article', text)),
  );
  const rows = dashboard.results.map((result) => {
    const row = element('article', undefined, 'history-row');
    const unit =
      result.mode === 'typing'
        ? 'caracteres coincidentes'
        : 'respuestas correctas';
    const date = new Date(result.submitted * 1000).toLocaleString('es-AR', {
      timeZone: 'America/Buenos_Aires',
    });
    row.append(
      element('h3', modeName(result.mode)),
      element('p', `${result.score} de ${result.total} ${unit} · ${date}`),
    );
    if (result.writing?.local) {
      const details = element('details');
      details.append(
        element('summary', 'Ver respuestas escritas y autoevaluación'),
        writingResult(result.writing),
      );
      row.append(details);
    }
    return row;
  });
  byId('results-list').replaceChildren(
    ...(rows.length
      ? rows
      : [element('p', 'Todavía no tenés prácticas completadas.')]),
  );
}
export function showExamResult(result) {
  const card = element('div', undefined, 'result-card');
  card.append(
    element('h3', `${result.score} de ${result.total} · ${result.percent}%`),
    element(
      'p',
      result.passed
        ? 'Objetivo de la prueba alcanzado.'
        : 'Podés repasar y volver a intentarlo.',
    ),
  );
  result.review.forEach((item) => {
    const row = element('div', undefined, 'review-item');
    row.append(
      element('h4', item.question),
      element('p', `Tu respuesta: ${item.selected}`),
      element('p', `Respuesta correcta: ${item.correct}`),
      element('p', item.explanation),
    );
    card.append(row);
  });
  byId('exam-result').replaceChildren(card);
  if (result.writing) card.append(writingResult(result.writing));
  card.scrollIntoView({ behavior: 'auto', block: 'start' });
}

function writingResult(writing) {
  const section = element('section', undefined, 'review-item');
  section.append(element('h3', 'Escritura y autoevaluación'));
  section.append(
    element(
      'p',
      'Revisá las sugerencias y compará tu texto con la respuesta orientativa.',
    ),
  );
  writing.answers.forEach((answer) => {
    section.append(element('h4', answer.question), element('p', answer.text));
    const feedback = answer.feedback;
    if (!feedback) return;
    section.append(element('p', `${feedback.words} palabras. ${feedback.note}`));
    if (!feedback.observations.length) {
      section.append(
        element(
          'p',
          'No se encontraron coincidencias con las reglas locales. Esto no garantiza que el texto esté libre de errores.',
        ),
      );
    }
    feedback.observations.forEach((item) =>
      section.append(
        element(
          'p',
          `${item.original ? '«' + item.original + '» → ' : ''}${item.suggestion}. ${item.message}`,
        ),
      ),
    );
    const guide = element('details');
    guide.append(
      element('summary', 'Comparar con una respuesta orientativa'),
      element('p', answer.guide),
    );
    section.append(guide);
  });
  section.append(element('h4', 'Revisá tu respuesta'));
  CHECKLIST.forEach((text) => {
    const label = element('label', undefined, 'option');
    const input = element('input');
    input.type = 'checkbox';
    label.append(input, element('span', text));
    section.append(label);
  });
  section.append(
    element(
      'p',
      'En GitHub Pages, las respuestas se conservan durante la sesión de esta pestaña. Podés volver a verlas en Mis resultados. Guardá una copia antes de cerrar la pestaña.',
    ),
  );
  return section;
}
