'use strict';

const path = require('path');
const fs = require('fs');
const { loadConfig, compileConfig, DEFAULT_CONFIG } = require('../src/config-loader');

describe('loadConfig', () => {
  test('設定が見つからない場合、デフォルト設定を返す', () => {
    const messages = [];
    const logger = { info: (m) => messages.push(m), warning: (m) => messages.push(m) };

    const config = loadConfig({ configPath: '/nonexistent/path.yml' }, logger);

    expect(config.highRiskPatterns.length).toBeGreaterThan(0);
    expect(config.lowRiskPatterns.length).toBeGreaterThan(0);
    expect(messages.some(m => m.includes('デフォルトルール'))).toBe(true);
  });

  test('空の options でもデフォルト設定にフォールバック', () => {
    const config = loadConfig({});
    expect(config.highRiskPatterns.length).toBeGreaterThan(0);
  });

  test('インライン文字列で設定を読み込める', () => {
    const messages = [];
    const logger = { info: (m) => messages.push(m), warning: (m) => messages.push(m) };

    const config = loadConfig({
      configString: `
high_risk_patterns:
  - ^inline/

low_risk_patterns:
  - pattern: \\.inline$
    label: インライン
`,
    }, logger);

    expect(config.highRiskPatterns).toHaveLength(1);
    expect(config.highRiskPatterns[0].test('inline/file.js')).toBe(true);
    expect(config.lowRiskPatterns[0].label).toBe('インライン');
    expect(messages.some(m => m.includes('インライン設定'))).toBe(true);
  });

  test('configString が空文字列の場合は configPath を使う', () => {
    const tmpPath = path.join(__dirname, 'fixtures', 'fallback.yml');
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, `
high_risk_patterns:
  - ^fromfile/
`);

    try {
      const config = loadConfig({ configString: '   ', configPath: tmpPath });
      expect(config.highRiskPatterns[0].test('fromfile/x')).toBe(true);
    } finally {
      fs.unlinkSync(tmpPath);
      fs.rmdirSync(path.dirname(tmpPath));
    }
  });

  test('正常な設定ファイルを読み込める', () => {
    const tmpPath = path.join(__dirname, 'fixtures', 'test-config.yml');
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, `
high_risk_patterns:
  - ^custom/

low_risk_patterns:
  - pattern: \\.txt$
    label: テキストファイル
`);

    try {
      const config = loadConfig({ configPath: tmpPath });
      expect(config.highRiskPatterns).toHaveLength(1);
      expect(config.highRiskPatterns[0].test('custom/file.js')).toBe(true);
      expect(config.lowRiskPatterns).toHaveLength(1);
      expect(config.lowRiskPatterns[0].pattern.test('readme.txt')).toBe(true);
      expect(config.lowRiskPatterns[0].label).toBe('テキストファイル');
    } finally {
      fs.unlinkSync(tmpPath);
      fs.rmdirSync(path.dirname(tmpPath));
    }
  });

  test('インライン設定がファイル設定より優先される', () => {
    const tmpPath = path.join(__dirname, 'fixtures', 'lower-priority.yml');
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, `
high_risk_patterns:
  - ^fromfile/
`);

    try {
      const config = loadConfig({
        configString: 'high_risk_patterns:\n  - ^frominline/\n',
        configPath: tmpPath,
      });
      expect(config.highRiskPatterns[0].test('frominline/x')).toBe(true);
      expect(config.highRiskPatterns[0].test('fromfile/x')).toBe(false);
    } finally {
      fs.unlinkSync(tmpPath);
      fs.rmdirSync(path.dirname(tmpPath));
    }
  });
});

describe('compileConfig', () => {
  test('文字列パターンを正規表現にコンパイル', () => {
    const config = compileConfig({
      high_risk_patterns: ['^app/'],
      low_risk_patterns: [{ pattern: '\\.md$', label: 'Markdown' }],
    });

    expect(config.highRiskPatterns[0]).toBeInstanceOf(RegExp);
    expect(config.highRiskPatterns[0].test('app/models/user.rb')).toBe(true);
    expect(config.lowRiskPatterns[0].pattern).toBeInstanceOf(RegExp);
    expect(config.lowRiskPatterns[0].pattern.test('README.md')).toBe(true);
  });

  test('空の設定でも動作する', () => {
    const config = compileConfig({});
    expect(config.highRiskPatterns).toEqual([]);
    expect(config.lowRiskPatterns).toEqual([]);
  });

  test('low_risk_patterns に文字列のみの場合もサポート', () => {
    const config = compileConfig({
      high_risk_patterns: [],
      low_risk_patterns: ['\\.md$'],
    });
    expect(config.lowRiskPatterns[0].pattern.test('README.md')).toBe(true);
    expect(config.lowRiskPatterns[0].label).toBe('\\.md$');
  });

  test('不正な正規表現でエラーが発生する', () => {
    expect(() => compileConfig({
      high_risk_patterns: ['[invalid'],
    })).toThrow();
  });
});

describe('DEFAULT_CONFIG', () => {
  test('デフォルト設定がコンパイル可能', () => {
    const config = compileConfig(DEFAULT_CONFIG);
    expect(config.highRiskPatterns.length).toBeGreaterThan(0);
    expect(config.lowRiskPatterns.length).toBeGreaterThan(0);
  });
});
