'use strict';

const { escapeFilename } = require('./risk-evaluator');

const COMMENT_MARKER = '<!-- auto-review-evaluation -->';

/**
 * eligible 判定結果に応じた PR コメント本文を生成する。
 *
 * @param {boolean} eligible
 * @param {string} actor - PR作成者
 * @param {string} teamSlug
 * @param {string[]} filenames - 変更ファイル一覧
 * @param {Set<string>} matchedCategories - 該当した低リスクカテゴリ
 * @param {string[]} reasons - レビュー必要な理由
 * @returns {string} コメント本文
 */
function buildComment(eligible, actor, teamSlug, filenames, matchedCategories, reasons) {
  if (eligible) {
    const fileList = filenames.map(f => `- \`${escapeFilename(f)}\``).join('\n');
    const categories = [...matchedCategories].join(', ');
    return [
      COMMENT_MARKER,
      '## :white_check_mark: ヒューマンレビュー不要と判定されました',
      '',
      '**判定理由:**',
      `- PR 作成者 (@${actor}) は \`${teamSlug}\` チームのメンバーです`,
      '- 高リスクファイルは含まれていません',
      `- すべての変更ファイルが以下のローリスクカテゴリに該当します: ${categories}`,
      '',
      `**変更ファイル (${filenames.length} 件):**`,
      fileList,
      '',
      '> この判定はプッシュごとに再評価されます。ハイリスクなファイルが追加された場合、ラベルは自動的に除去されます。',
    ].join('\n');
  }

  return [
    COMMENT_MARKER,
    '## :eyes: ヒューマンレビューが必要です',
    '',
    '**判定理由:**',
    reasons.join('\n'),
    '',
    '> この判定はプッシュごとに再評価されます。',
  ].join('\n');
}

/**
 * PR コメントを作成または更新する（マーカーで既存コメントを識別）。
 */
async function syncComment(github, owner, repo, prNumber, commentBody) {
  const comments = await github.paginate(
    github.rest.issues.listComments,
    { owner, repo, issue_number: prNumber, per_page: 100 },
  );
  const existing = comments.find(c => c.body?.includes(COMMENT_MARKER));

  if (existing) {
    await github.rest.issues.updateComment({
      owner, repo,
      comment_id: existing.id,
      body: commentBody,
    });
  } else {
    await github.rest.issues.createComment({
      owner, repo,
      issue_number: prNumber,
      body: commentBody,
    });
  }
}

module.exports = { buildComment, syncComment, COMMENT_MARKER };
