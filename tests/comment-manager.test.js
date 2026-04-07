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
