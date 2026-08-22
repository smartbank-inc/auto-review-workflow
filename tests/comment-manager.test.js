'use strict';

const { buildApprovalBody, buildSummary } = require('../src/comment-manager');
const { APPROVE_MARKER } = require('../src/review-manager');

describe('buildApprovalBody', () => {
  test('APPROVE_MARKER と判定理由が含まれる', () => {
    const matchedCategories = new Set(['ドキュメント (Markdown)']);
    const body = buildApprovalBody(
      'user1', 'developer',
      ['docs/README.md'], matchedCategories,
    );

    expect(body).toContain(APPROVE_MARKER);
    expect(body).toContain('ヒューマンレビュー不要');
    expect(body).toContain('@user1');
    expect(body).toContain('developer');
    expect(body).toContain('ドキュメント (Markdown)');
    expect(body).toContain('`docs/README.md`');
  });

  test('ファイル名のバッククォートがエスケープされる', () => {
    const matchedCategories = new Set(['ドキュメント (Markdown)']);
    const body = buildApprovalBody(
      'user1', 'developer',
      ['docs/test`file.md'], matchedCategories,
    );

    expect(body).toContain('docs/test\\`file.md');
  });

  test('複数カテゴリが表示される', () => {
    const matchedCategories = new Set(['テストコード', 'ドキュメント (Markdown)']);
    const body = buildApprovalBody(
      'user1', 'developer',
      ['spec/foo_spec.rb', 'docs/bar.md'], matchedCategories,
    );

    expect(body).toContain('テストコード');
    expect(body).toContain('ドキュメント (Markdown)');
  });
});

describe('buildSummary', () => {
  test('eligible: レビュー不要の概要テーブルが生成される', () => {
    const matchedCategories = new Set(['ドキュメント (Markdown)']);
    const riskResult = {
      hasHighRisk: false,
      allLowRisk: true,
      highRiskFiles: [],
      unknownFiles: [],
      matchedCategories,
    };
    const summary = buildSummary(
      true, 'user1', 'developer',
      ['docs/README.md'], matchedCategories, [],
      true, riskResult,
    );

    expect(summary).toContain('ヒューマンレビュー不要');
    expect(summary).toContain('@user1');
    expect(summary).toContain(':white_check_mark: はい');
    expect(summary).toContain('レビュー不要');
    expect(summary).toContain('ドキュメント (Markdown)');
  });

  test('not eligible: レビュー必須の概要テーブルが生成される', () => {
    const riskResult = {
      hasHighRisk: true,
      allLowRisk: false,
      highRiskFiles: ['app/models/user.rb'],
      unknownFiles: [],
      matchedCategories: new Set(),
    };
    const reasons = ['- ハイリスクファイルが 1 件含まれています'];
    const summary = buildSummary(
      false, 'user1', 'developer',
      ['app/models/user.rb'], new Set(), reasons,
      true, riskResult,
    );

    expect(summary).toContain('ヒューマンレビューが必要');
    expect(summary).toContain(':x: 1 件');
    expect(summary).toContain('レビュー必須');
    expect(summary).toContain('ハイリスクファイル');
  });

  test('非メンバー: チームメンバーが「いいえ」と表示される', () => {
    const riskResult = {
      hasHighRisk: false,
      allLowRisk: true,
      highRiskFiles: [],
      unknownFiles: [],
      matchedCategories: new Set(['ドキュメント (Markdown)']),
    };
    const reasons = ['- PR 作成者 (@user1) は `developer` チームのメンバーではありません'];
    const summary = buildSummary(
      false, 'user1', 'developer',
      ['docs/README.md'], new Set(), reasons,
      false, riskResult,
    );

    expect(summary).toContain(':x: いいえ');
  });
});

describe('buildApprovalBody（PR形状ルール該当時）', () => {
  test('revert_titleに該当した場合、形状ルールの理由が表示される', () => {
    const body = buildApprovalBody(
      'user1', 'developer',
      ['app/models/user.rb'], new Set(),
      { matched: true, rule: 'revert_title' },
    );

    expect(body).toContain('Revert PR');
    expect(body).toContain('`app/models/user.rb`');
  });

  test('deletion_onlyに該当した場合', () => {
    const body = buildApprovalBody(
      'user1', 'developer',
      ['app/models/old.rb'], new Set(),
      { matched: true, rule: 'deletion_only' },
    );

    expect(body).toContain('削除のみ');
  });
});

describe('buildSummary（PR形状ルール・actions update該当時）', () => {
  test('PR形状ルールに該当した場合、テーブルに表示される', () => {
    const riskResult = {
      hasHighRisk: true,
      allLowRisk: false,
      highRiskFiles: ['app/models/user.rb'],
      unknownFiles: [],
      matchedCategories: new Set(),
      actionsUpdateFiles: [],
    };
    const summary = buildSummary(
      true, 'user1', 'developer',
      ['app/models/user.rb'], new Set(), [],
      true, riskResult,
      { matched: true, rule: 'rename_only' },
    );

    expect(summary).toContain('rename/moveのみ');
  });

  test('actions update除外ファイルがある場合、テーブルに件数が表示される', () => {
    const riskResult = {
      hasHighRisk: false,
      allLowRisk: false,
      highRiskFiles: [],
      unknownFiles: ['.github/workflows/ci.yml'],
      matchedCategories: new Set(),
      actionsUpdateFiles: ['.github/workflows/ci.yml'],
    };
    const summary = buildSummary(
      false, 'user1', 'developer',
      ['.github/workflows/ci.yml'], new Set(), ['- GitHub Actions のバージョン更新のみの変更が 1 件含まれています'],
      true, riskResult,
      { matched: false, rule: null },
    );

    expect(summary).toContain('Actions update');
    expect(summary).toContain(':x: 1 件');
  });
});
