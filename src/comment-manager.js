'use strict';

const { escapeFilename } = require('./risk-evaluator');
const { APPROVE_MARKER } = require('./review-manager');

/**
 * 自動承認 review に載せる body を生成する。
 * 先頭に APPROVE_MARKER を含めることで自動承認 review として識別可能にする。
 *
 * @param {string} actor - PR作成者
 * @param {string} teamSlug
 * @param {string[]} filenames - 変更ファイル一覧
 * @param {Set<string>} matchedCategories - 該当した低リスクカテゴリ
 * @returns {string} review body
 */
function buildApprovalBody(actor, teamSlug, filenames, matchedCategories) {
  const fileList = filenames.map(f => `- \`${escapeFilename(f)}\``).join('\n');
  const categories = [...matchedCategories].join(', ');
  return [
    `${APPROVE_MARKER} このPRはリスク評価の結果、ヒューマンレビュー不要と判定されました。`,
    '',
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

/**
 * Job Summary 用の Markdown を生成する。
 */
function buildSummary(eligible, actor, teamSlug, filenames, matchedCategories, reasons, isMember, riskResult) {
  const lines = [];

  if (eligible) {
    lines.push('## :white_check_mark: ヒューマンレビュー不要');
  } else {
    lines.push('## :eyes: ヒューマンレビューが必要');
  }

  lines.push('');
  lines.push('| 項目 | 結果 |');
  lines.push('|------|------|');
  lines.push(`| PR 作成者 | @${actor} |`);
  lines.push(`| チームメンバー | ${isMember ? ':white_check_mark: はい' : ':x: いいえ'} |`);
  lines.push(`| 高リスクファイル | ${riskResult.hasHighRisk ? `:x: ${riskResult.highRiskFiles.length} 件` : ':white_check_mark: なし'} |`);
  lines.push(`| 全ファイル低リスク | ${riskResult.allLowRisk ? ':white_check_mark: はい' : ':x: いいえ'} |`);
  lines.push(`| 変更ファイル数 | ${filenames.length} 件 |`);
  lines.push(`| 判定 | **${eligible ? 'レビュー不要' : 'レビュー必須'}** |`);

  if (reasons.length > 0) {
    lines.push('');
    lines.push('### 理由');
    lines.push('');
    lines.push(...reasons);
  }

  if (eligible && matchedCategories.size > 0) {
    lines.push('');
    lines.push(`### 該当カテゴリ: ${[...matchedCategories].join(', ')}`);
  }

  return lines.join('\n');
}

module.exports = { buildApprovalBody, buildSummary };
