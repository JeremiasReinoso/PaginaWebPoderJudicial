"""Practice workflows and their SQLite transaction boundary."""
import json
import secrets
import time
from demo_content import MODULES, QUESTIONS as EXAM_QUESTIONS, TYPING_TEXT
from practice_texts import TEXTS, READING_QUESTIONS, draw_text
from domain import PracticeKind, PracticeMode, grade_exam, grade_typing
from errors import CampusError

QUESTIONS = {**EXAM_QUESTIONS, **READING_QUESTIONS}


def dashboard(store, principal):
    with store.db() as db:
        rows = db.execute('''
            SELECT mode, score, total, submitted FROM attempts
            WHERE username = ? AND submitted IS NOT NULL
            ORDER BY submitted DESC LIMIT 20
        ''', (principal,)).fetchall()
        earned = db.execute('''
            SELECT DISTINCT mode FROM attempts
            WHERE username = ? AND submitted IS NOT NULL
            AND mode LIKE 'module-%' AND total > 0 AND score * 4 >= total * 3
        ''', (principal,)).fetchall()
    results = [dict(row) for row in rows]
    achievements = sorted(row['mode'] for row in earned)
    return {
        'displayName': 'Acceso personal', 'modules': MODULES,
        'results': results[:20], 'achievements': achievements,
        'notices': [
            'Campus local de prueba. Ejercicios originales, sin valor oficial.',
            'Prueba: 4 preguntas por módulo y 20 en el integrador. La versión completa de 20/50 sigue en preparación.',
            'Lectura y mecanografía: textos largos aleatorios, sin repetir hasta recorrer el banco.',
        ],
    }


def typing_preview():
    return {
        'text': 'Iniciá una práctica para recibir un texto aleatorio. El cronómetro comenzará en ese momento.',
        'availableTexts': len(TEXTS),
    }


def start_practice(store, principal, value):
    mode = PracticeMode.parse(value)
    attempt, content = secrets.token_urlsafe(24), None
    with store.db() as db:
        db.execute('BEGIN IMMEDIATE')
        if mode.kind in (PracticeKind.READING, PracticeKind.TYPING):
            chosen = draw_text(db, principal, value, secrets.choice)
            content = {key: chosen[key] for key in ('id', 'title', 'topic', 'text')}
            if mode.kind is PracticeKind.TYPING:
                content['text'] = ' '.join(content['text'].split())
            ids = chosen['questionIds'][:] if mode.kind is PracticeKind.READING else []
        else:
            ids = [key for key, question in QUESTIONS.items() if question['module']
                   and (mode.kind is PracticeKind.FINAL or question['module'] == mode.module)]
        secrets.SystemRandom().shuffle(ids)
        db.execute('DELETE FROM attempts WHERE username = ? AND submitted IS NULL', (principal,))
        db.execute('''
            INSERT INTO attempts(id, username, mode, questions, started, content)
            VALUES(?,?,?,?,?,?)
        ''', (attempt, principal, value, json.dumps(ids), time.time(),
              json.dumps(content) if content else None))
    metadata = {
        'textId': content['id'], 'title': content['title'], 'topic': content['topic'],
        'wordCount': len(content['text'].split()),
    } if content else {}
    if mode.kind is PracticeKind.TYPING:
        return {'attempt': attempt, 'text': content['text'], **metadata}
    questions = [{key: val for key, val in QUESTIONS[qid].items()
                  if key not in ('correct', 'explanation')} for qid in ids]
    return {
        'attempt': attempt, 'questions': questions, 'mode': value,
        'passage': content['text'] if mode.kind is PracticeKind.READING else None,
        **metadata,
    }


def submit_practice(store, principal, body, *, typing=False):
    attempt = body.get('attempt')
    if not isinstance(attempt, str):
        raise CampusError(400, 'Intento inválido.')
    with store.db() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT * FROM attempts WHERE id = ? AND username = ?',
                         (attempt, principal)).fetchone()
        if not row:
            raise CampusError(404, 'Intento no encontrado.')
        if row['submitted'] is not None:
            raise CampusError(409, 'Este intento ya fue corregido.')
        now = time.time()
        if now - row['started'] > 2 * 60 * 60:
            raise CampusError(410, 'El intento venció.')
        if typing:
            if row['mode'] != 'typing':
                raise CampusError(400, 'Texto inválido.')
            # Compatibility with pending attempts created before text snapshots.
            source = json.loads(row['content'])['text'] if row['content'] else TYPING_TEXT
            score, total, result = grade_typing(source, body.get('text'), now - row['started'])
        else:
            if row['mode'] == 'typing':
                raise CampusError(400, 'Respondé todas las preguntas.')
            ids = json.loads(row['questions'])
            result = grade_exam([QUESTIONS[key] for key in ids], body.get('answers'))
            score, total = result['score'], result['total']
        db.execute('''
            UPDATE attempts SET submitted = ?, score = ?, total = ?, result = ? WHERE id = ?
        ''', (now, score, total, json.dumps(result), attempt))
    return result
