'use strict';

const { evaluate } = require('../src/evaluate');

/**
 * evaluate() のためのモックgithubクライアントを作る。
 * paginateは呼び出された関数の参照で分岐する。
 */
function createMockGithub({ files, members, existingLabels } = {}) {
  const state = {
    labels: new Set(existingLabels || []),
    reviews: [],
    addLabelsCalls: [],
    removeLabelCalls: [],
  };

  const rest = {
    teams: {
      listMembersInOrg: async () => (members || []).map(login => ({ login })),
    },
    pulls: {
      listFiles: async () => files || [],
      listReviews: async () => state.reviews,
      createReview: async ({ event, body }) => {
        state.reviews.push({ id: state.reviews.length + 1, state: event, body, user: { type: 'Bot' } });
      },
      dismissReview: async () => {},
    },
    issues: {
      getLabel: async ({ name }) => {
        if (!state.labels.has(name)) { const e = new Error('Not Found'); e.status = 404; throw e; }
        return {};
      },
      createLabel: async ({ name }) => { state.labels.add(name); },
      listLabelsOnIssue: async () => ({ data: [...state.labels].map(name => ({ name })) }),
      addLabels: async ({ labels }) => {
        labels.forEach(l => state.labels.add(l));
        state.addLabelsCalls.push(labels);
      },
      removeLabel: async ({ name }) => {
        state.labels.delete(name);
        state.removeLabelCalls.push(name);
      },
    },
  };

  const paginate = async (fn) => {
    if (fn === rest.teams.listMembersInOrg) return rest.teams.listMembersInOrg();
    if (fn === rest.pulls.listFiles) return rest.pulls.listFiles();
    if (fn === rest.pulls.listReviews) return rest.pulls.listReviews();
    throw new Error('unexpected paginate call');
  };

  return { rest, paginate, state };
}

function createMockContext({ prNumber = 1, actor = 'user1', title = 'feat: something', baseRef = 'develop' } = {}) {
  return {
    payload: {
      pull_request: {
        number: prNumber,
        user: { login: actor },
        title,
        base: { ref: baseRef },
      },
    },
    repo: { owner: 'example-org', repo: 'example-repo' },
  };
}

function createMockCore() {
  return {
    info: () => {},
    warning: () => {},
    summary: {
      addRaw: () => ({ write: async () => {} }),
    },
  };
}

describe('evaluate', () => {
  test('aiVerdictMatched が "True"（大文字小文字違い）の場合、AI経由では承認されない', async () => {
    const github = createMockGithub({
      files: [{ filename: 'app/models/user.rb', status: 'modified', additions: 1, deletions: 0 }],
      members: ['user1'],
      existingLabels: [],
    });
    const context = createMockContext();
    const core = createMockCore();

    await evaluate({
      github, context, core,
      inputs: {
        configString: '', teamSlug: 'developer', org: 'smartbank-inc', labelName: 'auto-review',
        skipActors: [], releaseBaseRef: 'main',
        aiVerdictMatched: 'True', aiVerdictCategory: 'local_refactor', aiVerdictReason: '...',
      },
    });

    expect(github.state.reviews).toHaveLength(0);
    expect(github.state.labels.has('auto-review:ai')).toBe(false);
  });

  test('eligibleVia が pr_shape の場合、aiVerdictMatched が true でも auto-review:ai ラベルは付かない', async () => {
    const github = createMockGithub({
      files: [{ filename: 'app/models/old.rb', status: 'removed', additions: 0, deletions: 10 }],
      members: ['user1'],
      existingLabels: [],
    });
    const context = createMockContext({ title: 'chore: 不要なファイルを削除' });
    const core = createMockCore();

    await evaluate({
      github, context, core,
      inputs: {
        configString: `
pr_level_low_risk_rules:
  - deletion_only
`,
        teamSlug: 'developer', org: 'smartbank-inc', labelName: 'auto-review',
        skipActors: [], releaseBaseRef: 'main',
        aiVerdictMatched: 'true', aiVerdictCategory: 'local_refactor', aiVerdictReason: '...',
      },
    });

    expect(github.state.reviews).toHaveLength(1);
    expect(github.state.reviews[0].state).toBe('APPROVE');
    expect(github.state.labels.has('auto-review')).toBe(true);
    expect(github.state.labels.has('auto-review:ai')).toBe(false);
  });

  test('eligible が false の場合、既存の auto-review:ai ラベルが除去される', async () => {
    const github = createMockGithub({
      files: [{ filename: 'app/models/user.rb', status: 'modified', additions: 5, deletions: 0 }],
      members: ['user1'],
      existingLabels: ['auto-review', 'auto-review:ai'],
    });
    const context = createMockContext();
    const core = createMockCore();

    await evaluate({
      github, context, core,
      inputs: {
        configString: '', teamSlug: 'developer', org: 'smartbank-inc', labelName: 'auto-review',
        skipActors: [], releaseBaseRef: 'main',
        aiVerdictMatched: 'false', aiVerdictCategory: '', aiVerdictReason: '',
      },
    });

    expect(github.state.labels.has('auto-review')).toBe(false);
    expect(github.state.labels.has('auto-review:ai')).toBe(false);
    expect(github.state.removeLabelCalls).toContain('auto-review:ai');
  });
});
