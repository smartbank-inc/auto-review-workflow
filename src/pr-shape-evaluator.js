'use strict';

/**
 * GitHub標準のRevertボタンが生成するPRタイトル形式かどうかを判定する。
 * 例: Revert "元のPRタイトル"
 *
 * @param {string} title - PRタイトル
 * @returns {boolean}
 */
function isRevertTitle(title) {
  return /^Revert "/.test(title);
}

/**
 * PR内の全変更ファイルが「追加行なし（削除のみ）」であるかを判定する。
 * ファイル全体削除（status=removed）と、ファイル内の一部行削除の両方を対象に含む。
 *
 * @param {{ additions: number, deletions: number }[]} files
 * @returns {boolean}
 */
function isDeletionOnly(files) {
  return files.length > 0 && files.every(f => f.additions === 0 && f.deletions > 0);
}

/**
 * PR内の全変更ファイルが「内容変更を伴わない純粋なrename/move」であるかを判定する。
 *
 * @param {{ status: string, additions: number, deletions: number }[]} files
 * @returns {boolean}
 */
function isRenameOnly(files) {
  return files.length > 0 && files.every(f => f.status === 'renamed' && f.additions === 0 && f.deletions === 0);
}

const PR_SHAPE_RULES = {
  revert_title: (files, title) => isRevertTitle(title),
  deletion_only: (files) => isDeletionOnly(files),
  rename_only: (files) => isRenameOnly(files),
};

/**
 * PR形状ルール（revert_title / deletion_only / rename_only）を評価し、
 * 該当するものがあれば最初に一致したルール名を返す。
 * enabledRules の並び順が優先順位になる。
 *
 * @param {object[]} files
 * @param {string} title - PRタイトル
 * @param {string[]} enabledRules - 有効化するルール名の配列（config の pr_level_low_risk_rules）
 * @returns {{ matched: boolean, rule: string|null }}
 */
function evaluatePrShape(files, title, enabledRules) {
  for (const ruleName of enabledRules) {
    const check = PR_SHAPE_RULES[ruleName];
    if (check && check(files, title)) {
      return { matched: true, rule: ruleName };
    }
  }
  return { matched: false, rule: null };
}

module.exports = { isRevertTitle, isDeletionOnly, isRenameOnly, evaluatePrShape };
