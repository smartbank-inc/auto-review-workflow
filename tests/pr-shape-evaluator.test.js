'use strict';

const { isRevertTitle, isDeletionOnly, isRenameOnly, evaluatePrShape } = require('../src/pr-shape-evaluator');

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

describe('isDeletionOnly', () => {
  test('全ファイルが additions=0 の削除のみ → true', () => {
    const files = [
      { filename: 'app/models/old_user.rb', status: 'removed', additions: 0, deletions: 42 },
      { filename: 'spec/models/old_user_spec.rb', status: 'removed', additions: 0, deletions: 10 },
    ];
    expect(isDeletionOnly(files)).toBe(true);
  });

  test('部分的な行削除のみ（ファイルは残る）→ true', () => {
    const files = [
      { filename: 'app/models/user.rb', status: 'modified', additions: 0, deletions: 5 },
    ];
    expect(isDeletionOnly(files)).toBe(true);
  });

  test('1件でも additions > 0 のファイルがあれば false', () => {
    const files = [
      { filename: 'app/models/old_user.rb', status: 'removed', additions: 0, deletions: 42 },
      { filename: 'app/models/user.rb', status: 'modified', additions: 3, deletions: 1 },
    ];
    expect(isDeletionOnly(files)).toBe(false);
  });

  test('ファイルが空配列なら false', () => {
    expect(isDeletionOnly([])).toBe(false);
  });
});

describe('isRenameOnly', () => {
  test('全ファイルが内容変更なしのrenameのみ → true', () => {
    const files = [
      { filename: 'app/models/new_name.rb', status: 'renamed', additions: 0, deletions: 0 },
    ];
    expect(isRenameOnly(files)).toBe(true);
  });

  test('renameかつ内容変更あり → false', () => {
    const files = [
      { filename: 'app/models/new_name.rb', status: 'renamed', additions: 2, deletions: 1 },
    ];
    expect(isRenameOnly(files)).toBe(false);
  });

  test('rename以外のファイルが混在 → false', () => {
    const files = [
      { filename: 'app/models/new_name.rb', status: 'renamed', additions: 0, deletions: 0 },
      { filename: 'app/models/other.rb', status: 'modified', additions: 1, deletions: 0 },
    ];
    expect(isRenameOnly(files)).toBe(false);
  });

  test('ファイルが空配列なら false', () => {
    expect(isRenameOnly([])).toBe(false);
  });
});

describe('evaluatePrShape', () => {
  const enabledRules = ['revert_title', 'deletion_only', 'rename_only'];

  test('revertタイトル → matched: true, rule: revert_title', () => {
    const files = [{ filename: 'app/models/user.rb', status: 'modified', additions: 3, deletions: 1 }];
    const result = evaluatePrShape(files, 'Revert "fix: foo"', enabledRules);
    expect(result).toEqual({ matched: true, rule: 'revert_title' });
  });

  test('削除のみPR → matched: true, rule: deletion_only', () => {
    const files = [{ filename: 'app/models/old.rb', status: 'removed', additions: 0, deletions: 10 }];
    const result = evaluatePrShape(files, 'chore: 不要なコードを削除', enabledRules);
    expect(result).toEqual({ matched: true, rule: 'deletion_only' });
  });

  test('renameのみPR → matched: true, rule: rename_only', () => {
    const files = [{ filename: 'app/models/new.rb', status: 'renamed', additions: 0, deletions: 0 }];
    const result = evaluatePrShape(files, 'refactor: ファイル名変更', enabledRules);
    expect(result).toEqual({ matched: true, rule: 'rename_only' });
  });

  test('どれにも該当しない → matched: false, rule: null', () => {
    const files = [{ filename: 'app/models/user.rb', status: 'modified', additions: 3, deletions: 1 }];
    const result = evaluatePrShape(files, 'feat: 新機能追加', enabledRules);
    expect(result).toEqual({ matched: false, rule: null });
  });

  test('該当してもenabledRulesに含まれなければ matched: false', () => {
    const files = [{ filename: 'app/models/old.rb', status: 'removed', additions: 0, deletions: 10 }];
    const result = evaluatePrShape(files, 'chore: 削除', []);
    expect(result).toEqual({ matched: false, rule: null });
  });
});
