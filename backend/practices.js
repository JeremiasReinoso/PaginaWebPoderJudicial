/** Practice workflows and their SQLite transaction boundary. */
import crypto from 'node:crypto';
import {
  MODULES,
  QUESTIONS as EXAM_QUESTIONS,
  TYPING_TEXT,
} from './demo_content.js';
import { TEXTS, READING_QUESTIONS, draw_text } from './practice_texts.js';
import {
  PracticeKind,
  PracticeMode,
  grade_exam,
  grade_typing,
} from './domain.js';
import { CampusError } from './errors.js';

export const QUESTIONS = { ...EXAM_QUESTIONS, ...READING_QUESTIONS };

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function randomChoice(candidates) {
  return candidates[crypto.randomInt(0, candidates.length)];
}

export function dashboard(store, principal) {
  const { rows, earned } = store.withDb((db) => {
    const r = db
      .prepare(
        `SELECT mode, score, total, submitted FROM attempts
         WHERE username = ? AND submitted IS NOT NULL
         ORDER BY submitted DESC LIMIT 20`,
      )
      .all(principal);
    const e = db
      .prepare(
        `SELECT DISTINCT mode FROM attempts
         WHERE username = ? AND submitted IS NOT NULL
         AND mode LIKE 'module-%' AND total > 0 AND score * 4 >= total * 3`,
      )
      .all(principal);
    return { rows: r, earned: e };
  });
  const results = rows.map((row) => ({ ...row }));
  const achievements = earned.map((row) => row.mode).sort();
  return {
    displayName: 'Acceso personal',
    modules: MODULES,
    results: results.slice(0, 20),
    achievements,
    notices: [
      'Campus local de prueba. Ejercicios originales, sin valor oficial.',
      'Prueba: 4 preguntas por módulo y 20 en el integrador. La versión completa de 20/50 sigue en preparación.',
      'Lectura y mecanografía: textos largos aleatorios, sin repetir hasta recorrer el banco.',
    ],
  };
}

export function typing_preview() {
  return {
    text: 'Iniciá una práctica para recibir un texto aleatorio. El cronómetro comenzará en ese momento.',
    availableTexts: TEXTS.length,
  };
}

export function start_practice(store, principal, value) {
  const mode = PracticeMode.parse(value);
  const attempt = crypto.randomBytes(24).toString('base64url');
  let content = null;
  let ids = [];

  store.withDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    if (
      mode.kind === PracticeKind.READING ||
      mode.kind === PracticeKind.TYPING
    ) {
      const chosen = draw_text(db, principal, value, randomChoice);
      content = {
        id: chosen.id,
        title: chosen.title,
        topic: chosen.topic,
        text:
          mode.kind === PracticeKind.TYPING
            ? chosen.text.trim().split(/\s+/).join(' ')
            : chosen.text,
      };
      ids = mode.kind === PracticeKind.READING ? [...chosen.questionIds] : [];
    } else {
      ids = Object.entries(QUESTIONS)
        .filter(
          ([, q]) =>
            q.module &&
            (mode.kind === PracticeKind.FINAL || q.module === mode.module),
        )
        .map(([key]) => key);
    }
    shuffle(ids);
    db.prepare(
      'DELETE FROM attempts WHERE username = ? AND submitted IS NULL',
    ).run(principal);
    db.prepare(
      `INSERT INTO attempts(id, username, mode, questions, started, content)
       VALUES(?, ?, ?, ?, ?, ?)`,
    ).run(
      attempt,
      principal,
      value,
      JSON.stringify(ids),
      Date.now() / 1000,
      content ? JSON.stringify(content) : null,
    );
  });

  const metadata = content
    ? {
        textId: content.id,
        title: content.title,
        topic: content.topic,
        wordCount: content.text.trim().split(/\s+/).length,
      }
    : {};

  if (mode.kind === PracticeKind.TYPING) {
    return { attempt, text: content.text, ...metadata };
  }

  const questions = ids.map((qid) => {
    const { correct, explanation, ...rest } = QUESTIONS[qid];
    return rest;
  });

  return {
    attempt,
    questions,
    mode: value,
    passage: mode.kind === PracticeKind.READING ? content.text : null,
    ...metadata,
  };
}

export function submit_practice(
  store,
  principal,
  body,
  { typing = false } = {},
) {
  const attempt = body?.attempt;
  if (typeof attempt !== 'string') {
    throw new CampusError(400, 'Intento inválido.');
  }
  return store.withDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    const row = db
      .prepare('SELECT * FROM attempts WHERE id = ? AND username = ?')
      .get(attempt, principal);
    if (!row) {
      throw new CampusError(404, 'Intento no encontrado.');
    }
    if (row.submitted !== null && row.submitted !== undefined) {
      throw new CampusError(409, 'Este intento ya fue corregido.');
    }
    const now = Date.now() / 1000;
    if (now - row.started > 2 * 60 * 60) {
      throw new CampusError(410, 'El intento venció.');
    }
    let score;
    let total;
    let result;
    if (typing) {
      if (row.mode !== 'typing') {
        throw new CampusError(400, 'Texto inválido.');
      }
      // Compatibility with pending attempts created before text snapshots.
      const source = row.content ? JSON.parse(row.content).text : TYPING_TEXT;
      [score, total, result] = grade_typing(
        source,
        body?.text,
        now - row.started,
      );
    } else {
      if (row.mode === 'typing') {
        throw new CampusError(400, 'Respondé todas las preguntas.');
      }
      const ids = JSON.parse(row.questions);
      result = grade_exam(
        ids.map((key) => QUESTIONS[key]),
        body?.answers,
      );
      score = result.score;
      total = result.total;
    }
    db.prepare(
      'UPDATE attempts SET submitted = ?, score = ?, total = ?, result = ? WHERE id = ?',
    ).run(now, score, total, JSON.stringify(result), attempt);
    return result;
  });
}
