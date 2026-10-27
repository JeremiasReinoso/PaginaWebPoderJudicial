from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from domain import PracticeKind, PracticeMode, grade_typing
from errors import CampusError


class DomainRules(unittest.TestCase):
    def test_mode_excludes_impossible_module_combinations(self):
        self.assertEqual(PracticeMode.parse('module-3').module, 3)
        with self.assertRaises(ValueError):
            PracticeMode(PracticeKind.READING, 2)
        with self.assertRaises(ValueError):
            PracticeMode(PracticeKind.MODULE, 0)
        for value in ['module-6', 'module-01', None, [], True]:
            with self.assertRaises(CampusError):
                PracticeMode.parse(value)

    def test_typing_counts_missing_characters(self):
        score, total, result = grade_typing('texto completo', 'texto', 60)
        self.assertEqual((score, total), (5, 14))
        self.assertFalse(result['completed'])
        self.assertLess(result['accuracy'], 100)


if __name__ == '__main__':
    unittest.main()
