'use strict';

/**
 * ファイル一覧からリスク判定を行う。
 *
 * @param {string[]} filenames - 変更ファイルパス一覧
 * @param {{ highRiskPatterns: RegExp[], lowRiskPatterns: { pattern: RegExp, label: string }[] }} config
 * @returns {{ hasHighRisk: boolean, allLowRisk: boolean, highRiskFiles: string[], unknownFiles: string[], matchedCategories: Set<string> }}
 */
function evaluateRisk(filenames, config) {
  const highRiskFiles = filenames.filter(f =>
    config.highRiskPatterns.some(p => p.test(f))
  );
  const hasHighRisk = highRiskFiles.length > 0;

  const matchedCategories = new Set();
  const unknownFiles = [];

  for (const f of filenames) {
    const matched = config.lowRiskPatterns.find(({ pattern }) => pattern.test(f));
    if (matched) {
      matchedCategories.add(matched.label);
    } else {
      unknownFiles.push(f);
    }
  }

  const allLowRisk = filenames.length > 0 && unknownFiles.length === 0;

  return { hasHighRisk, allLowRisk, highRiskFiles, unknownFiles, matchedCategories };
}

/**
 * 最終的な eligible 判定を行う。
 *
 * @param {boolean} isMember - チームメンバーかどうか
 * @param {{ hasHighRisk: boolean, allLowRisk: boolean, highRiskFiles: string[], unknownFiles: string[], matchedCategories: Set<string> }} riskResult
 * @param {string} actor - PR作成者のログイン名
 * @param {string} teamSlug - チームスラッグ名
 * @returns {{ eligible: boolean, reasons: string[] }}
 */
function determineEligibility(isMember, riskResult, actor, teamSlug) {
  const { hasHighRisk, allLowRisk, highRiskFiles, unknownFiles } = riskResult;
  const eligible = isMember && !hasHighRisk && allLowRisk;

  const reasons = [];
  if (!isMember) {
    reasons.push(`- PR 作成者 (@${actor}) は \`${teamSlug}\` チームのメンバーではありません`);
  }
  if (hasHighRisk) {
    reasons.push(`- ハイリスクファイルが ${highRiskFiles.length} 件含まれています`);
  }
  if (!hasHighRisk && !allLowRisk && unknownFiles.length > 0) {
    reasons.push(`- ローリスクに分類できないファイルが ${unknownFiles.length} 件含まれています`);
  }
  if (riskResult.hasHighRisk === false && riskResult.allLowRisk === false && unknownFiles.length === 0) {
    reasons.push('- 変更ファイルがありません');
  }

  return { eligible, reasons };
}

/**
 * ファイル名をバッククォート付きで安全に表示する。
 */
function escapeFilename(f) {
  return f.replace(/`/g, '\\`');
}

function formatFileList(files, limit = 10) {
  const displayed = files.slice(0, limit);
  const remaining = files.length - displayed.length;
  const formatted = displayed.map(f => '`' + escapeFilename(f) + '`').join(', ');
  return remaining > 0 ? `${formatted} 他 ${remaining} 件` : formatted;
}

module.exports = { evaluateRisk, determineEligibility, escapeFilename, formatFileList };
