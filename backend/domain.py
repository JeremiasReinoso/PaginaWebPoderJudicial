"""Study rules independent of HTTP, SQLite, clocks and random generators."""
from dataclasses import dataclass
from enum import Enum
from errors import CampusError


class PracticeKind(str, Enum):
    MODULE = 'module'
    FINAL = 'final'
    READING = 'reading'
    TYPING = 'typing'


@dataclass(frozen=True)
class PracticeMode:
    kind: PracticeKind
    module: int | None = None

    def __post_init__(self):
        if not isinstance(self.kind, PracticeKind):
            raise ValueError('Tipo de práctica inválido.')
        if self.kind is PracticeKind.MODULE:
            if type(self.module) is not int or self.module not in range(1, 6):
                raise ValueError('Un examen de módulo requiere un módulo del 1 al 5.')
        elif self.module is not None:
            raise ValueError('Solo el examen de módulo lleva un número de módulo.')

    @classmethod
    def parse(cls, value):
        if isinstance(value, str):
            if value in ('final', 'reading', 'typing'):
                return cls(PracticeKind(value))
            if value in {f'module-{i}' for i in range(1, 6)}:
                return cls(PracticeKind.MODULE, int(value[-1]))
        raise CampusError(400, 'Ejercicio inválido.')


def grade_exam(questions, answers):
    ids = {q['id'] for q in questions}
    if (not isinstance(answers, dict) or set(answers) != ids
            or any(type(value) is not int or not 0 <= value <= 3
                   for value in answers.values())):
        raise CampusError(400, 'Respondé todas las preguntas.')
    score = sum(answers[q['id']] == q['correct'] for q in questions)
    total = len(questions)
    return {
        'score': score, 'total': total, 'percent': round(score * 100 / total),
        'passed': score / total >= .75,
        'review': [{
            'question': q['question'],
            'selected': q['options'][answers[q['id']]],
            'correct': q['options'][q['correct']],
            'explanation': q['explanation'],
        } for q in questions],
    }


def grade_typing(source, typed, seconds):
    if not isinstance(typed, str) or not 1 <= len(typed) <= 5000:
        raise CampusError(400, 'Texto inválido.')
    seconds = max(seconds, 1)
    score = sum(a == b for a, b in zip(typed, source))
    total = max(len(typed), len(source))
    result = {
        'seconds': round(seconds, 1),
        'accuracy': round(100 * score / total, 1),
        'wpm': round((score / 5) / (seconds / 60), 1),
        'completed': typed == source,
        'note': 'Precisión por coincidencia de caracteres en la misma posición; el texto faltante también cuenta.',
    }
    return score, total, result
