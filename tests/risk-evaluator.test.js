'use strict';

const { evaluateRisk, determineEligibility, escapeFilename, formatFileList } = require('../src/risk-evaluator');
const { compileConfig, DEFAULT_CONFIG } = require('../src/config-loader');

const config = compileConfig(DEFAULT_CONFIG);

describe('evaluateRisk', () => {
  test('docs変更のみ → allLowRisk', () => {
    const result = evaluateRisk(['docs/README.md', 'CLAUDE.md'], config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
    expect(result.matchedCategories.has('ドキュメント (Markdown)')).toBe(true);
  });

  test('spec変更のみ → allLowRisk', () => {
    const result = evaluateRisk(['spec/models/user_spec.rb'], config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
    expect(result.matchedCategories.has('テストコード')).toBe(true);
  });

  test('test/変更のみ → allLowRisk', () => {
    const result = evaluateRisk(['test/models/user_test.rb'], config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
  });

  test('app配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(['app/models/user.rb'], config);
    expect(result.hasHighRisk).toBe(true);
    expect(result.highRiskFiles).toEqual(['app/models/user.rb']);
  });

  test('lib配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(['lib/tasks/foo.rake'], config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('config配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(['config/routes.rb'], config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('db配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(['db/Schemafile'], config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('Gemfile変更 → hasHighRisk', () => {
    const result = evaluateRisk(['Gemfile'], config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('Gemfile.lock変更 → hasHighRisk', () => {
    const result = evaluateRisk(['Gemfile.lock'], config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('.github配下の変更 → hasHighRisk', () => {
    const result = evaluateRisk(['.github/workflows/ci.yml'], config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('高リスク + 低リスク混在 → hasHighRisk', () => {
    const result = evaluateRisk(['docs/README.md', 'app/models/user.rb'], config);
    expect(result.hasHighRisk).toBe(true);
  });

  test('境界ケース（Rakefile）→ neither high nor low', () => {
    const result = evaluateRisk(['Rakefile'], config);
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
    const result = evaluateRisk(['spec/foo_spec.rb', 'docs/bar.md'], config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
    expect(result.matchedCategories.size).toBe(2);
  });

  test('.rbs ファイル → allLowRisk', () => {
    const result = evaluateRisk(['sig/models/user.rbs'], config);
    expect(result.hasHighRisk).toBe(false);
    expect(result.allLowRisk).toBe(true);
    expect(result.matchedCategories.has('RBS 型定義')).toBe(true);
  });

  test('src配下の変更 → hasHighRisk (デフォルト設定)', () => {
    const result = evaluateRisk(['src/index.ts'], config);
    expect(result.hasHighRisk).toBe(true);
  });
});

describe('determineEligibility', () => {
  test('メンバー + 低リスクのみ → eligible', () => {
    const riskResult = evaluateRisk(['docs/README.md'], config);
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer');
    expect(eligible).toBe(true);
    expect(reasons).toHaveLength(0);
  });

  test('非メンバー → not eligible + 理由', () => {
    const riskResult = evaluateRisk(['docs/README.md'], config);
    const { eligible, reasons } = determineEligibility(false, riskResult, 'user1', 'developer');
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('メンバーではありません');
  });

  test('メンバー + 高リスク → not eligible + 理由', () => {
    const riskResult = evaluateRisk(['app/models/user.rb'], config);
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer');
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('ハイリスクファイル');
  });

  test('メンバー + 境界ケース → not eligible + 理由', () => {
    const riskResult = evaluateRisk(['Rakefile'], config);
    const { eligible, reasons } = determineEligibility(true, riskResult, 'user1', 'developer');
    expect(eligible).toBe(false);
    expect(reasons[0]).toContain('ローリスクに分類できない');
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
