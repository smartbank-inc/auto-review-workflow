'use strict';

const { buildComment, COMMENT_MARKER } = require('../src/comment-manager');

describe('buildComment', () => {
  test('eligible: マーカーと判定理由が含まれる', () => {
    const matchedCategories = new Set(['ドキュメント (Markdown)']);
    const body = buildComment(
      true, 'user1', 'developer',
      ['docs/README.md'], matchedCategories, [],
    );

    expect(body).toContain(COMMENT_MARKER);
    expect(body).toContain('ヒューマンレビュー不要');
    expect(body).toContain('@user1');
    expect(body).toContain('developer');
    expect(body).toContain('ドキュメント (Markdown)');
    expect(body).toContain('`docs/README.md`');
  });

  test('not eligible: 理由が含まれる', () => {
    const reasons = ['- ハイリスクファイルが含まれています: `app/models/user.rb`'];
    const body = buildComment(
      false, 'user1', 'developer',
      ['app/models/user.rb'], new Set(), reasons,
    );

    expect(body).toContain(COMMENT_MARKER);
    expect(body).toContain('ヒューマンレビューが必要です');
    expect(body).toContain('ハイリスクファイル');
  });

  test('ファイル名のバッククォートがエスケープされる', () => {
    const matchedCategories = new Set(['ドキュメント (Markdown)']);
    const body = buildComment(
      true, 'user1', 'developer',
      ['docs/test`file.md'], matchedCategories, [],
    );

    expect(body).toContain('docs/test\\`file.md');
  });

  test('複数カテゴリが表示される', () => {
    const matchedCategories = new Set(['テストコード', 'ドキュメント (Markdown)']);
    const body = buildComment(
      true, 'user1', 'developer',
      ['spec/foo_spec.rb', 'docs/bar.md'], matchedCategories, [],
    );

    expect(body).toContain('テストコード');
    expect(body).toContain('ドキュメント (Markdown)');
  });
});
