import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PracticeKind,
  PracticeMode,
  ValueError,
  grade_typing,
} from '../backend/domain.js';
import { CampusError } from '../backend/errors.js';

describe('DomainRules', () => {
  test('test_mode_excludes_impossible_module_combinations', () => {
    assert.equal(PracticeMode.parse('module-3').module, 3);
    assert.throws(
      () => new PracticeMode(PracticeKind.READING, 2),
      ValueError,
    );
    assert.throws(
      () => new PracticeMode(PracticeKind.MODULE, 0),
      ValueError,
    );
    for (const value of ['module-6', 'module-01', null, [], true]) {
      assert.throws(() => PracticeMode.parse(value), CampusError);
    }
  });

  test('test_typing_counts_missing_characters', () => {
    const [score, total, result] = grade_typing('texto completo', 'texto', 60);
    assert.deepEqual([score, total], [5, 14]);
    assert.equal(result.completed, false);
    assert.ok(result.accuracy < 100);
  });
});
