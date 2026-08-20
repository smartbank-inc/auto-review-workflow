'use strict';

const { isRevertTitle, isDeletionOnly, isRenameOnly } = require('../src/pr-shape-evaluator');

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
