'use strict';

const { evaluateRisk, determineEligibility, escapeFilename, formatFileList, containsActionsVersionChange } = require('../src/risk-evaluator');
const { compileConfig, DEFAULT_CONFIG } = require('../src/config-loader');

const config = compileConfig(DEFAULT_CONFIG);

/**
 * テスト用ヘルパー: ファイル名の配列を、evaluateRisk が要求する最小限の
 * ファイルオブジェクト配列に変換する。status/additions/deletions は
 * デフォルトで「通常の変更」を表す値にする。
 */
function toFiles(filenames, overrides = {}) {
  return filenames.map(filename => ({
    filename,
    status: 'modified',
    additions: 1,
    deletions: 0,
    patch: undefined,
    ...overrides,
  }));
}

describe('evaluateRisk', () => {
  test('docs変更のみ → allLowRisk', () => {
    const result = evaluateRisk(toFiles(['docs/README.md', 'CLAUDE.md']), config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
    expect(result.matchedCategories.has('ドキュメント (Markdown)')).toBe(true);
  });

  test('spec変更のみ → allLowRisk', () => {
    const result = evaluateRisk(toFiles(['spec/models/user_spec.rb']), config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
    expect(result.matchedCategories.has('テストコード')).toBe(true);
  });

  test('test/変更のみ → allLowRisk', () => {
    const result = evaluateRisk(toFiles(['test/models/user_test.rb']), config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
  });

  test('app配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(toFiles(['app/models/user.rb']), config);
    expect(result.hasHighRisk).toBe(true);
    expect(result.highRiskFiles).toEqual(['app/models/user.rb']);
  });

  test('lib配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(toFiles(['lib/tasks/foo.rake']), config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('config配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(toFiles(['config/routes.rb']), config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('db配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(toFiles(['db/Schemafile']), config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('Gemfile変更 → hasHighRisk', () => {
    const result = evaluateRisk(toFiles(['Gemfile']), config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('Gemfile.lock変更 → hasHighRisk', () => {
    const result = evaluateRisk(toFiles(['Gemfile.lock']), config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('.github配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(toFiles(['.github/workflows/ci.yml']), config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('高リスク + 低リスク混在 → hasHighRisk', () => {
    const result = evaluateRisk(toFiles(['docs/README.md', 'app/models/user.rb']), config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('境界ケース（Rakefile）→ neither high nor low', () => {
    const result = evaluateRisk(toFiles(['Rakefile']), config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(false);
    expect(result.unknownFiles).toEqual(['Rakefile']);
  });

  test('空のファイル一覧 → allLowRisk = false', () => {
    const result = evaluateRisk([], config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(false);
  });

  test('spec + docs混在 → allLowRisk', () => {
    const result = evaluateRisk(toFiles(['spec/foo_spec.rb', 'docs/bar.md']), config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
    expect(result.matchedCategories.size).toBe(2);
  });

  test('.rbs ファイル → allLowRisk', () => {
    const result = evaluateRisk(toFiles(['sig/models/user.rbs']), config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
    expect(result.matchedCategories.has('RBS 型定義')).toBe(true);
  });

  test('src配下の変更 → hasHighRisk (デフォルト設定)', () => {
    const result = evaluateRisk(toFiles(['src/index.ts']), config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('actions_update_excluded な低リスクパターンに該当し、diffがuses:行のみ → actionsUpdateFilesに含まれ allLowRisk = false', () => {
    const customConfig = compileConfig({
      low_risk_patterns: [
        { pattern: '^\\.github/workflows/', label: 'ワークフロー', actions_update_excluded: true },
      ],
    });
    const files = [
      {
        filename: '.github/workflows/ci.yml',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: '@@ -1,1 +1,1 @@\n-        uses: actions/checkout@abc123 # v6.0.0\n+        uses: actions/checkout@def456 # v7.0.0',
      },
    ];
    const result = evaluateRisk(files, customConfig);
    expect(result.actionsUpdateFiles).toEqual(['.github/workflows/ci.yml']);
    expect(result.allLowRisk).toBe(false);
    expect(result.unknownFiles).toEqual(['.github/workflows/ci.yml']);
    expect(result.matchedCategories.has('ワークフロー')).toBe(false);
  });

  test('回帰テスト P1: actions_update_excluded パターンで、uses:以外の変更が混在していても除外される（部分バイパス修正）', () => {
    // 以前は diff 全体が uses: 行のみでないと除外されず、uses: のピン変更に無害な1行
    // （ここでは別ステップの追加）を混ぜるだけでガードを回避できてしまっていた。
    const customConfig = compileConfig({
      low_risk_patterns: [
        { pattern: '^\\.github/workflows/', label: 'ワークフロー', actions_update_excluded: true },
      ],
    });
    const files = [
      {
        filename: '.github/workflows/ci.yml',
        status: 'modified',
        additions: 2,
        deletions: 1,
        patch: '@@ -1,1 +1,2 @@\n-        uses: actions/checkout@abc123 # v6.0.0\n+        uses: actions/checkout@def456 # v7.0.0\n+      - run: echo hi',
      },
    ];
    const result = evaluateRisk(files, customConfig);
    expect(result.actionsUpdateFiles).toEqual(['.github/workflows/ci.yml']);
    expect(result.allLowRisk).toBe(false);
    expect(result.unknownFiles).toEqual(['.github/workflows/ci.yml']);
    expect(result.matchedCategories.has('ワークフロー')).toBe(false);
  });

  test('回帰テスト C1: actions_update_excluded パターンで patch 欠落 → 安全側に倒す（excluded 扱い）', () => {
    const customConfig = compileConfig({
      low_risk_patterns: [
        { pattern: '^\\.github/workflows/', label: 'ワークフロー', actions_update_excluded: true },
      ],
    });
    const files = [
      {
        filename: '.github/workflows/ci.yml',
        status: 'modified',
        additions: 10,
        deletions: 5,
        patch: undefined, // patch 欠落 → 安全側に倒すべき
      },
    ];
    const result = evaluateRisk(files, customConfig);
    expect(result.actionsUpdateFiles).toEqual(['.github/workflows/ci.yml']);
    expect(result.allLowRisk).toBe(false);
    expect(result.unknownFiles).toEqual(['.github/workflows/ci.yml']);
    expect(result.matchedCategories.has('ワークフロー')).toBe(false);
  });

  test('回帰テスト I2: 複数パターンマッチで、後の方が actions_update_excluded → 後の方のフラグを尊重', () => {
    const customConfig = compileConfig({
      low_risk_patterns: [
        { pattern: '\\.yml$', label: '汎用YAML', actions_update_excluded: false },
        { pattern: '^\\.github/workflows/', label: 'ワークフロー', actions_update_excluded: true },
      ],
    });
    const files = [
      {
        filename: '.github/workflows/ci.yml',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: '@@ -1,1 +1,1 @@\n-        uses: actions/checkout@abc123 # v6.0.0\n+        uses: actions/checkout@def456 # v7.0.0',
      },
    ];
    const result = evaluateRisk(files, customConfig);
    expect(result.actionsUpdateFiles).toEqual(['.github/workflows/ci.yml']);
    expect(result.allLowRisk).toBe(false);
    expect(result.unknownFiles).toEqual(['.github/workflows/ci.yml']);
  });
});

describe('determineEligibility', () => {
  const noShapeMatch = { matched: false, rule: null };

  test('メンバー + 低リスクのみ → eligible', () => {
    const riskResult = evaluateRisk(toFiles(['docs/README.md']), config);
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer', noShapeMatch, false);
    expect(eligible).toBe(true);
    expect(reasons).toHaveLength(0);
  });

  test('非メンバー → not eligible + 理由', () => {
    const riskResult = evaluateRisk(toFiles(['docs/README.md']), config);
    const { eligible, reasons } = determineEligibility(false, riskResult, 'user1', 'developer', noShapeMatch, false);
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('メンバーではありません');
  });

  test('メンバー + 高リスク → not eligible + 件数表示', () => {
    const riskResult = evaluateRisk(toFiles(['app/models/user.rb']), config);
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer', noShapeMatch, false);
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('ハイリスクファイルが 1 件');
  });

  test('メンバー + 境界ケース → not eligible + 件数表示', () => {
    const riskResult = evaluateRisk(toFiles(['Rakefile']), config);
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer', noShapeMatch, false);
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('ローリスクに分類できないファイルが 1 件');
  });

  test('リリースブランチ向けPR → 他の条件に関わらず not eligible', () => {
    const riskResult = evaluateRisk(toFiles(['docs/README.md']), config);
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer', noShapeMatch, true);
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('リリースブランチ');
  });

  test('PR形状ルールに該当（revert等）→ 高リスクパスを含んでいても eligible', () => {
    const riskResult = evaluateRisk(toFiles(['app/models/user.rb']), config);
    const shapeMatch = { matched: true, rule: 'revert_title' };
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer', shapeMatch, false);
    expect(eligible).toBe(true);
    expect(reasons).toHaveLength(0);
  });

  test('PR形状ルールに該当していても非メンバーなら not eligible', () => {
    const riskResult = evaluateRisk(toFiles(['app/models/user.rb']), config);
    const shapeMatch = { matched: true, rule: 'revert_title' };
    const { eligible, reasons } = determineEligibility(false, riskResult, 'user1', 'developer', shapeMatch, false);
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('メンバーではありません');
  });

  test('actions update除外ファイルのみ → not eligible + 理由', () => {
    const customConfig = compileConfig({
      low_risk_patterns: [
        { pattern: '^\\.github/workflows/', label: 'ワークフロー', actions_update_excluded: true },
      ],
    });
    const files = [
      {
        filename: '.github/workflows/ci.yml',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: '@@ -1,1 +1,1 @@\n-        uses: actions/checkout@abc123 # v6.0.0\n+        uses: actions/checkout@def456 # v7.0.0',
      },
    ];
    const riskResult = evaluateRisk(files, customConfig);
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer', noShapeMatch, false);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('Actions'))).toBe(true);
  });

  test('PR形状ルールに該当していても、actions update除外ファイルがあれば not eligible', () => {
    const customConfig = compileConfig({
      low_risk_patterns: [
        { pattern: '^\\.github/workflows/', label: 'ワークフロー', actions_update_excluded: true },
      ],
    });
    const files = [
      {
        filename: '.github/workflows/ci.yml',
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: '@@ -1,1 +1,1 @@\n-        uses: actions/checkout@abc123 # v6.0.0\n+        uses: actions/checkout@def456 # v7.0.0',
      },
    ];
    const riskResult = evaluateRisk(files, customConfig);
    const shapeMatch = { matched: true, rule: 'revert_title' };
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer', shapeMatch, false);
    expect(eligible).toBe(false);
    expect(reasons.some(r => r.includes('Actions'))).toBe(true);
  });
});

describe('escapeFilename', () => {
  test('バッククォートをエスケープ', () => {
    expect(escapeFilename('docs/test`file.md')).toBe('docs/test\\`file.md');
  });

  test('通常のファイル名はそのまま', () => {
    expect(escapeFilename('docs/README.md')).toBe('docs/README.md');
  });
});

describe('formatFileList', () => {
  test('10件以内はすべて表示', () => {
    const result = formatFileList(['a.md', 'b.md']);
    expect(result).toBe('`a.md`, `b.md`');
  });

  test('10件超は「他 N 件」と表示', () => {
    const files = Array.from({ length: 12 }, (_, i) => `file${i}.md`);
    const result = formatFileList(files);
    expect(result).toContain('他 2 件');
  });
});

describe('containsActionsVersionChange', () => {
  test('uses:行のバージョン更新のみ → true', () => {
    const patch = [
      '@@ -10,7 +10,7 @@',
      '       - name: Checkout',
      '-        uses: actions/checkout@abc123 # v6.0.0',
      '+        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    ].join('\n');
    expect(containsActionsVersionChange(patch)).toBe(true);
  });

  test('uses:行の変更に他の変更が混在していても → true（部分バイパス修正）', () => {
    const patch = [
      '@@ -10,7 +10,8 @@',
      '-        uses: actions/checkout@abc123 # v6.0.0',
      '+        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      '+      - run: echo hello',
    ].join('\n');
    expect(containsActionsVersionChange(patch)).toBe(true);
  });

  test('uses:行の変更が1つも無ければ → false', () => {
    const patch = [
      '@@ -10,7 +10,8 @@',
      '-      - run: echo old',
      '+      - run: echo new',
    ].join('\n');
    expect(containsActionsVersionChange(patch)).toBe(false);
  });

  test('patchがundefined（大きすぎるファイル等）→ false', () => {
    expect(containsActionsVersionChange(undefined)).toBe(false);
  });

  test('変更行が1つもない（ヘッダのみ）→ false', () => {
    expect(containsActionsVersionChange('@@ -1,3 +1,3 @@\n context line')).toBe(false);
  });

  test('@を含まないuses:行（docker参照等）のバージョン更新のみ → true', () => {
    const patch = [
      '@@ -5,3 +5,3 @@',
      '-        uses: docker://alpine:3.18',
      '+        uses: docker://alpine:3.19',
    ].join('\n');
    expect(containsActionsVersionChange(patch)).toBe(true);
  });
});
