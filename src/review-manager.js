'use strict';

const APPROVE_MARKER = '[自動承認]';

/**
 * eligible に応じて自動承認レビューを作成、または既存の自動承認を取り消す。
 */
async function syncReview(github, owner, repo, prNumber, eligible, core) {
  const allReviews = await github.paginate(
    github.rest.pulls.listReviews,
    { owner, repo, pull_number: prNumber, per_page: 100 },
  );

  // APPROVE_MARKER を含むレビューを自動承認として識別
  // （user.type === 'Bot' で人間の誤マッチを防止）
  const autoApprovals = allReviews.filter(
    r => r.state === 'APPROVED' && r.body?.includes(APPROVE_MARKER) && r.user?.type === 'Bot'
  );

  if (eligible) {
    if (autoApprovals.length === 0) {
      await github.rest.pulls.createReview({
        owner, repo, pull_number: prNumber,
        event: 'APPROVE',
        body: `${APPROVE_MARKER} このPRはリスク評価の結果、ヒューマンレビュー不要と判定されました。`,
      });
    }
  } else {
    for (const review of autoApprovals) {
      try {
        await github.rest.pulls.dismissReview({
          owner, repo, pull_number: prNumber,
          review_id: review.id,
          message: 'PRの変更内容が更新され、ヒューマンレビューが必要と判定されたため、自動承認を取り消しました。',
        });
      } catch (dismissError) {
        core.warning(`自動承認の取り消しに失敗しました: ${dismissError.message}`);
      }
    }
  }
}

module.exports = { syncReview, APPROVE_MARKER };
