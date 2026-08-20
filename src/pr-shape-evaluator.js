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

module.exports = { isRevertTitle };
