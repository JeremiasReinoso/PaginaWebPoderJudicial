/** Study rules independent of HTTP, SQLite, clocks and random generators. */
import { CampusError } from './errors.js';

export const PracticeKind = Object.freeze({
  MODULE: 'module',
  FINAL: 'final',
  READING: 'reading',
  TYPING: 'typing',
});

export class PracticeMode {
  constructor(kind, module = null) {
    if (!Object.values(PracticeKind).includes(kind)) {
      throw new ValueError('Tipo de práctica inválido.');
    }
    if (kind === PracticeKind.MODULE) {
      if (
        typeof module !== 'number' ||
        !Number.isInteger(module) ||
        module < 1 ||
        module > 5
      ) {
        throw new ValueError(
          'Un examen de módulo requiere un módulo del 1 al 5.',
        );
      }
    } else if (module !== null && module !== undefined) {
      throw new ValueError(
        'Solo el examen de módulo lleva un número de módulo.',
      );
    }
    this.kind = kind;
    this.module = module;
    Object.freeze(this);
  }

  static parse(value) {
    if (typeof value === 'string') {
      if (['final', 'reading', 'typing'].includes(value)) {
        return new PracticeMode(value, null);
      }
      if (/^module-[1-5]$/.test(value)) {
        return new PracticeMode(PracticeKind.MODULE, Number(value.slice(-1)));
      }
    }
    throw new CampusError(400, 'Ejercicio inválido.');
  }
}

export class ValueError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValueError';
  }
}

export function grade_exam(questions, answers) {
  if (
    typeof answers !== 'object' ||
    answers === null ||
    Array.isArray(answers)
  ) {
    throw new CampusError(400, 'Respondé todas las preguntas.');
  }
  const ids = new Set(questions.map((q) => q.id));
  const answerKeys = Object.keys(answers);
  if (
    answerKeys.length !== ids.size ||
    answerKeys.some((key) => !ids.has(key)) ||
    Object.values(answers).some(
      (val) =>
        typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > 3,
    )
  ) {
    throw new CampusError(400, 'Respondé todas las preguntas.');
  }
  let score = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correct) score += 1;
  }
  const total = questions.length;
  return {
    score,
    total,
    percent: Math.round((score * 100) / total),
    passed: score / total >= 0.75,
    review: questions.map((q) => ({
      question: q.question,
      selected: q.options[answers[q.id]],
      correct: q.options[q.correct],
      explanation: q.explanation,
    })),
  };
}

export function grade_typing(source, typed, seconds) {
  if (typeof typed !== 'string' || typed.length < 1 || typed.length > 5000) {
    throw new CampusError(400, 'Texto inválido.');
  }
  const clampedSeconds = Math.max(seconds, 1);
  const minLen = Math.min(typed.length, source.length);
  let score = 0;
  for (let i = 0; i < minLen; i += 1) {
    if (typed[i] === source[i]) score += 1;
  }
  const total = Math.max(typed.length, source.length);
  const round1 = (val) => Math.round(val * 10) / 10;
  const result = {
    seconds: round1(clampedSeconds),
    accuracy: round1((100 * score) / total),
    wpm: round1(score / 5 / (clampedSeconds / 60)),
    completed: typed === source,
    note: 'Precisión por coincidencia de caracteres en la misma posición; el texto faltante también cuenta.',
  };
  return [score, total, result];
}
