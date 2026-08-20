'use strict';

const { isRevertTitle } = require('../src/pr-shape-evaluator');

describe('isRevertTitle', () => {
  test('GitHub標準のRevertボタン形式 → true', () => {
    expect(isRevertTitle('Revert "fix: 決済APIのタイムアウトを修正"')).toBe(true);
  });

  test('別のRevert PRタイトル形式 → true', () => {
    expect(isRevertTitle('Revert "feat: 新機能Xを追加"')).toBe(true);
  });

  test('小文字のrevert → false', () => {
    expect(isRevertTitle('revert: fix foo')).toBe(false);
  });

  test('引用符なしのRevert → false', () => {
    expect(isRevertTitle('Revert PR #123')).toBe(false);
  });

  test('通常のPRタイトル → false', () => {
    expect(isRevertTitle('fix: ユーザー登録のバリデーション修正')).toBe(false);
  });
});
