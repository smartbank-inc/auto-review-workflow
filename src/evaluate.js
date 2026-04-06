'use strict';

const { loadConfig } = require('./config-loader');
const { evaluateRisk, determineEligibility } = require('./risk-evaluator');
const { ensureLabel, syncLabel } = require('./label-manager');
const { syncReview } = require('./review-manager');
const { buildComment, syncComment, buildSummary } = require('./comment-manager');

/**
 * github-script から呼ばれるメインエントリポイント。
 * PR のリスク評価 → ラベル管理 → 自動承認 → コメントを一貫して実行する。
 */
async function evaluate({ github, context, core, inputs }) {
  const { configString, teamSlug, org, labelName, skipActors } = inputs;
  const prNumber = context.payload.pull_request.number;
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const actor = context.payload.pull_request.user.login;

  // ── 0. Bot/skip actor チェック ──
  if (skipActors.includes(actor)) {
    core.info(`PR author (${actor}) はスキップ対象です。処理を終了します。`);
    return;
  }

  // ── 1. Team メンバーシップ確認 ──
  // teams.getMembershipForUserInOrg は App token だと制限があるため、
  // team メンバー一覧を取得して actor が含まれるかチェックする
  let isMember = false;
  try {
    const members = await github.paginate(
      github.rest.teams.listMembersInOrg,
      { org, team_slug: teamSlug, per_page: 100 },
    );
    isMember = members.some(m => m.login === actor);
    if (!isMember) {
      core.info(`${actor} は ${org}/${teamSlug} のメンバーではありません。`);
    }
  } catch (error) {
    isMember = false;
    core.warning(`Team メンバー一覧の取得に失敗しました (status=${error.status}): ${error.message}。GitHub App に Organization > Members: read 権限があるか確認してください。`);
  }

  // ── 2. 変更ファイル一覧を取得 ──
  const files = await github.paginate(
    github.rest.pulls.listFiles,
    { owner, repo, pull_number: prNumber, per_page: 100 },
  );
  const filenames = files.map(f => f.filename);

  // ── 3. 設定読み込み + リスク判定 ──
  const config = loadConfig(configString, core);
  const riskResult = evaluateRisk(filenames, config);
  const { eligible, reasons } = determineEligibility(isMember, riskResult, actor, teamSlug);

  // ── 4. ラベル管理 ──
  await ensureLabel(github, owner, repo, labelName);
  await syncLabel(github, owner, repo, prNumber, labelName, eligible);

  // ── 5. 自動承認 / 取り消し ──
  await syncReview(github, owner, repo, prNumber, eligible, core);

  // ── 6. PR コメント（eligible 時のみ、not eligible 時は既存コメント削除） ──
  const commentBody = buildComment(
    eligible, actor, teamSlug, filenames, riskResult.matchedCategories, reasons,
  );
  await syncComment(github, owner, repo, prNumber, eligible, commentBody);

  // ── 7. Job Summary ──
  const summary = buildSummary(
    eligible, actor, teamSlug, filenames, riskResult.matchedCategories, reasons, isMember, riskResult,
  );
  await core.summary.addRaw(summary).write();

  core.info(`PR #${prNumber}: eligible=${eligible}, isMember=${isMember}, hasHighRisk=${riskResult.hasHighRisk}, allLowRisk=${riskResult.allLowRisk}, files=${filenames.length}`);
}

module.exports = { evaluate };
