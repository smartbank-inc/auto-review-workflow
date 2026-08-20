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

module.exports = { isRevertTitle, isDeletionOnly, isRenameOnly };
