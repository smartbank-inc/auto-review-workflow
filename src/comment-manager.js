'use strict';

const { escapeFilename } = require('./risk-evaluator');
const { APPROVE_MARKER } = require('./review-manager');

const PR_SHAPE_RULE_LABELS = {
  revert_title: 'Revert PR',
  deletion_only: '削除のみ',
  rename_only: 'rename/moveのみ',
};

/**
 * 自動承認 review に載せる body を生成する。
 * 先頭に APPROVE_MARKER を含めることで自動承認 review として識別可能にする。
 *
 * @param {string} actor - PR作成者
 * @param {string} teamSlug
 * @param {string[]} filenames - 変更ファイル一覧
 * @param {Set<string>} matchedCategories - 該当した低リスクカテゴリ
 * @param {{ matched: boolean, rule: string|null }} [prShapeResult] - PR形状ルールの判定結果
 * @returns {string} review body
 */
function buildApprovalBody(actor, teamSlug, filenames, matchedCategories, prShapeResult) {
  const fileList = filenames.map(f => `- \`${escapeFilename(f)}\``).join('\n');

  const reasonLines = [];
  if (prShapeResult && prShapeResult.matched) {
    const ruleLabel = PR_SHAPE_RULE_LABELS[prShapeResult.rule] || prShapeResult.rule;
    reasonLines.push(`- PR形状ルール「${ruleLabel}」に該当しました（高リスクパスの判定より優先されます）`);
  } else {
    const categories = [...matchedCategories].join(', ');
    reasonLines.push('- 高リスクファイルは含まれていません');
    reasonLines.push(`- すべての変更ファイルが以下のローリスクカテゴリに該当します: ${categories}`);
  }

  return [
    `${APPROVE_MARKER} このPRはリスク評価の結果、ヒューマンレビュー不要と判定されました。`,
    '',
    '## :white_check_mark: ヒューマンレビュー不要と判定されました',
    '',
    '**判定理由:**',
    `- PR 作成者 (@${actor}) は \`${teamSlug}\` チームのメンバーです`,
    ...reasonLines,
    '',
    `**変更ファイル (${filenames.length} 件):**`,
    fileList,
    '',
    '> この判定はプッシュごとに再評価されます。ハイリスクなファイルが追加された場合、ラベルは自動的に除去されます。',
  ].join('\n');
}

/**
 * Job Summary 用の Markdown を生成する。
 *
 * @param {{ matched: boolean, rule: string|null }} [prShapeResult] - PR形状ルールの判定結果
 */
function buildSummary(eligible, actor, teamSlug, filenames, matchedCategories, reasons, isMember, riskResult, prShapeResult) {
  const lines = [];
  const actionsUpdateFiles = riskResult.actionsUpdateFiles || [];

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
  lines.push(`| PR形状ルール | ${prShapeResult && prShapeResult.matched ? `:white_check_mark: ${PR_SHAPE_RULE_LABELS[prShapeResult.rule] || prShapeResult.rule}` : ':heavy_minus_sign: 該当なし'} |`);
  lines.push(`| 高リスクファイル | ${riskResult.hasHighRisk ? `:x: ${riskResult.highRiskFiles.length} 件` : ':white_check_mark: なし'} |`);
  lines.push(`| Actions update除外ファイル | ${actionsUpdateFiles.length > 0 ? `:x: ${actionsUpdateFiles.length} 件` : ':white_check_mark: なし'} |`);
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
