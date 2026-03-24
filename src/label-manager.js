'use strict';

/**
 * ラベルの存在確認と作成、PRへの付与・除去を管理する。
 */

/**
 * ラベルが存在しなければ作成する。
 */
async function ensureLabel(github, owner, repo, labelName) {
  try {
    await github.rest.issues.getLabel({ owner, repo, name: labelName });
  } catch (e) {
    if (e.status === 404) {
      try {
        await github.rest.issues.createLabel({
          owner, repo,
          name: labelName,
          color: '0e8a16',
          description: 'ヒューマンレビュー不要と判定された PR',
        });
      } catch (createError) {
        if (createError.status !== 422) throw createError;
      }
    }
  }
}

/**
 * eligible に応じてラベルを付与または除去する。
 *
 * @returns {boolean} 操作前にラベルが付いていたかどうか
 */
async function syncLabel(github, owner, repo, prNumber, labelName, eligible) {
  const currentLabels = await github.rest.issues.listLabelsOnIssue({
    owner, repo, issue_number: prNumber,
  });
  const hasLabel = currentLabels.data.some(l => l.name === labelName);

  if (eligible && !hasLabel) {
    await github.rest.issues.addLabels({
      owner, repo, issue_number: prNumber,
      labels: [labelName],
    });
  } else if (!eligible && hasLabel) {
    await github.rest.issues.removeLabel({
      owner, repo, issue_number: prNumber,
      name: labelName,
    });
  }

  return hasLabel;
}

module.exports = { ensureLabel, syncLabel };
