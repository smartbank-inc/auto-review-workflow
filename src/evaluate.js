'use strict';

const { loadConfig } = require('./config-loader');
const { evaluateRisk, determineEligibility } = require('./risk-evaluator');
const { evaluatePrShape } = require('./pr-shape-evaluator');
const { ensureLabel, syncLabel } = require('./label-manager');
const { syncReview } = require('./review-manager');
const { buildApprovalBody, buildSummary } = require('./comment-manager');

const AI_LABEL_NAME = 'auto-review:ai';

/**
 * github-script から呼ばれるメインエントリポイント。
 * PR のリスク評価 → ラベル管理 → 自動承認 → コメントを一貫して実行する。
 */
async function evaluate({ github, context, core, inputs }) {
  const {
    configString, teamSlug, org, labelName, skipActors, releaseBaseRef,
    aiVerdictMatched, aiVerdictCategory, aiVerdictReason,
  } = inputs;
  const prNumber = context.payload.pull_request.number;
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const actor = context.payload.pull_request.user.login;
  const title = context.payload.pull_request.title;
  const baseRef = context.payload.pull_request.base.ref;

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

  // ── 2. リリースブランチ向けPRかどうかを判定 ──
  // releaseBaseRef が undefined/null の場合（release-base-ref input を持たない古いバージョンの
  // evaluate.yml から呼ばれた場合など）は 'main' にフォールバックし、安全側に倒す。
  const resolvedReleaseBaseRef = releaseBaseRef ?? 'main';
  const isReleaseBranch = resolvedReleaseBaseRef !== '' && baseRef === resolvedReleaseBaseRef;
  if (isReleaseBranch) {
    core.info(`base branch (${baseRef}) はリリースブランチのため、自動承認の対象外です。`);
  }

  // ── 3. 変更ファイル一覧を取得（status/additions/deletions/patch を含む） ──
  const files = await github.paginate(
    github.rest.pulls.listFiles,
    { owner, repo, pull_number: prNumber, per_page: 100 },
  );
  const filenames = files.map(f => f.filename);

  // ── 4. 設定読み込み + リスク判定 ──
  const config = loadConfig(configString, core);
  const riskResult = evaluateRisk(files, config);
  const prShapeResult = evaluatePrShape(files, title, config.prLevelLowRiskRules);
  // AI判定結果（呼び出し元のワークフローが外部のAIエージェント等による分類結果をinputとして渡す）
  const aiVerdict = {
    matched: aiVerdictMatched === 'true',
    category: aiVerdictCategory || null,
    reason: aiVerdictReason || null,
  };
  const { eligible, reasons, eligibleVia } = determineEligibility(
    isMember, riskResult, actor, teamSlug, prShapeResult, isReleaseBranch, aiVerdict,
  );

  // ── 5. ラベル管理 ──
  await ensureLabel(github, owner, repo, labelName);
  await syncLabel(github, owner, repo, prNumber, labelName, eligible);

  // AI判定が eligible の決め手だった場合のみ、事後分析用の第2ラベルを付与する。
  // ラベル操作の失敗が自動承認取り消し（syncReview）をブロックしないよう、
  // try/catchで囲みwarningに留める（fail-open防止）。
  const aiApproved = eligibleVia === 'ai_verdict';
  try {
    if (aiApproved) {
      await ensureLabel(github, owner, repo, AI_LABEL_NAME);
    }
    await syncLabel(github, owner, repo, prNumber, AI_LABEL_NAME, aiApproved);
  } catch (error) {
    core.warning(`auto-review:ai ラベルの同期に失敗しました: ${error.message}`);
  }

  // ── 6. 自動承認 / 取り消し（eligible 時は review body に判定詳細を載せる） ──
  const approvalBody = eligible
    ? buildApprovalBody(actor, teamSlug, filenames, riskResult.matchedCategories, prShapeResult, aiVerdict, eligibleVia)
    : '';
  await syncReview(github, owner, repo, prNumber, eligible, core, approvalBody);

  // ── 7. Job Summary ──
  const summary = buildSummary(
    eligible, actor, teamSlug, filenames, riskResult.matchedCategories, reasons, isMember, riskResult, prShapeResult, aiVerdict, eligibleVia,
  );
  await core.summary.addRaw(summary).write();

  core.info(`PR #${prNumber}: eligible=${eligible}, isMember=${isMember}, isReleaseBranch=${isReleaseBranch}, prShapeRule=${prShapeResult.rule}, aiVerdictMatched=${aiVerdict.matched}, hasHighRisk=${riskResult.hasHighRisk}, allLowRisk=${riskResult.allLowRisk}, files=${filenames.length}`);
}

module.exports = { evaluate };
