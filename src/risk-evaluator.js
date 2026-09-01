'use strict';

const USES_LINE_PATTERN = /^[+-]\s*-?\s*uses:\s*\S+/;

/**
 * ワークフローファイルのdiffが、GitHub Actionsのバージョン参照（uses:）行の
 * 変更のみで構成されているかを判定する。
 * patchが取得できない場合はfalseを返す。
 * 呼び出し側（evaluateRisk）で、actions_update_excludedなパターンに該当したファイルの
 * patchが無い場合は安全側（要レビュー継続）に倒す必要がある — このpatch不在ケースの
 * 安全側判定はevaluateRisk側の責務である。
 *
 * @param {string|undefined} patch - unified diff形式のpatch文字列
 * @returns {boolean}
 */
function isActionsUpdateOnly(patch) {
  if (!patch) return false;
  const changedLines = patch
    .split('\n')
    .filter(line => (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---'));
  if (changedLines.length === 0) return false;
  return changedLines.every(line => USES_LINE_PATTERN.test(line));
}

/**
 * 変更ファイル一覧からリスク判定を行う。
 *
 * @param {{ filename: string, status: string, additions: number, deletions: number, patch?: string }[]} files
 * @param {{ highRiskPatterns: RegExp[], lowRiskPatterns: { pattern: RegExp, label: string, actionsUpdateExcluded: boolean }[] }} config
 * @returns {{ hasHighRisk: boolean, allLowRisk: boolean, highRiskFiles: string[], unknownFiles: string[], matchedCategories: Set<string>, actionsUpdateFiles: string[] }}
 */
function evaluateRisk(files, config) {
  const highRiskFiles = files
    .filter(f => config.highRiskPatterns.some(p => p.test(f.filename)))
    .map(f => f.filename);
  const hasHighRisk = highRiskFiles.length > 0;

  const matchedCategories = new Set();
  const unknownFiles = [];
  const actionsUpdateFiles = [];

  for (const f of files) {
    const matches = config.lowRiskPatterns.filter(({ pattern }) => pattern.test(f.filename));

    if (matches.length === 0) {
      unknownFiles.push(f.filename);
      continue;
    }

    const actionsUpdateExcluded = matches.some(m => m.actionsUpdateExcluded);
    if (actionsUpdateExcluded && (!f.patch || isActionsUpdateOnly(f.patch))) {
      actionsUpdateFiles.push(f.filename);
      unknownFiles.push(f.filename);
      continue;
    }

    matchedCategories.add(matches[0].label);
  }

  const allLowRisk = files.length > 0 && unknownFiles.length === 0;

  return { hasHighRisk, allLowRisk, highRiskFiles, unknownFiles, matchedCategories, actionsUpdateFiles };
}

/**
 * 最終的な eligible 判定を行う。
 *
 * @param {boolean} isMember - チームメンバーかどうか
 * @param {{ hasHighRisk: boolean, allLowRisk: boolean, highRiskFiles: string[], unknownFiles: string[], matchedCategories: Set<string>, actionsUpdateFiles: string[] }} riskResult
 * @param {string} actor - PR作成者のログイン名
 * @param {string} teamSlug - チームスラッグ名
 * @param {{ matched: boolean, rule: string|null }} prShapeResult - PR形状ルールの判定結果
 * @param {boolean} isReleaseBranch - リリースブランチ（develop→main等）向けのPRかどうか
 * @param {{ matched: boolean, category: string|null, reason: string|null }} [aiVerdict] - AI判定結果。未指定時は既存動作と完全互換
 * @returns {{ eligible: boolean, reasons: string[], eligibleVia: 'pr_shape'|'ai_verdict'|'mechanical'|null }} eligibleVia は eligible=true の場合にどの経路で確定したかを示す。eligible=false の場合は null
 */
function determineEligibility(isMember, riskResult, actor, teamSlug, prShapeResult, isReleaseBranch, aiVerdict) {
  const { hasHighRisk, allLowRisk, highRiskFiles, unknownFiles, actionsUpdateFiles } = riskResult;
  const reasons = [];

  if (isReleaseBranch) {
    reasons.push('- リリースブランチ向けのPRのため、自動承認の対象外です');
    return { eligible: false, reasons, eligibleVia: null };
  }

  if (!isMember) {
    reasons.push(`- PR 作成者 (@${actor}) は \`${teamSlug}\` チームのメンバーではありません`);
  }

  // PR形状ルール（revert/削除のみ/renameのみ）は高リスクパス判定より優先する。
  // ただし actions update のみの変更（サプライチェーンリスク）はバイパスしない。
  if (prShapeResult.matched && actionsUpdateFiles.length === 0) {
    return { eligible: isMember, reasons: isMember ? [] : reasons, eligibleVia: isMember ? 'pr_shape' : null };
  }

  // AI判定も同様に高リスクパス判定より優先する。
  // actions update のみの変更はバイパスしない（PR形状ルールと同じ制約）。
  if (aiVerdict && aiVerdict.matched === true && actionsUpdateFiles.length === 0) {
    return { eligible: isMember, reasons: isMember ? [] : reasons, eligibleVia: isMember ? 'ai_verdict' : null };
  }

  if (hasHighRisk) {
    reasons.push(`- ハイリスクファイルが ${highRiskFiles.length} 件含まれています`);
  }
  if (actionsUpdateFiles.length > 0) {
    reasons.push(`- GitHub Actions のバージョン更新のみの変更が ${actionsUpdateFiles.length} 件含まれています（サプライチェーンリスクのため要レビュー）`);
  }
  const otherUnknownCount = unknownFiles.length - actionsUpdateFiles.length;
  if (!hasHighRisk && !allLowRisk && otherUnknownCount > 0) {
    reasons.push(`- ローリスクに分類できないファイルが ${otherUnknownCount} 件含まれています`);
  }
  if (!hasHighRisk && !allLowRisk && unknownFiles.length === 0) {
    reasons.push('- 変更ファイルがありません');
  }

  const eligible = isMember && !hasHighRisk && allLowRisk;
  return { eligible, reasons, eligibleVia: eligible ? 'mechanical' : null };
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

module.exports = { evaluateRisk, determineEligibility, escapeFilename, formatFileList, isActionsUpdateOnly };
