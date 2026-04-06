'use strict';

const { loadConfig, compileConfig, DEFAULT_CONFIG } = require('../src/config-loader');

describe('loadConfig', () => {
  test('config 未指定（undefined）の場合、デフォルト設定を返す', () => {
    const messages = [];
    const logger = { info: (m) => messages.push(m), warning: (m) => messages.push(m) };

    const config = loadConfig(undefined, logger);

    expect(config.highRiskPatterns.length).toBeGreaterThan(0);
    expect(config.lowRiskPatterns.length).toBeGreaterThan(0);
    expect(messages.some(m => m.includes('デフォルトルール'))).toBe(true);
  });

  test('config が空文字列の場合、デフォルト設定を返す', () => {
    const config = loadConfig('');
    expect(config.highRiskPatterns.length).toBeGreaterThan(0);
  });

  test('config が空白のみの場合、デフォルト設定を返す', () => {
    const config = loadConfig('   \n  ');
    expect(config.highRiskPatterns.length).toBeGreaterThan(0);
  });

  test('インライン YAML 文字列で設定を読み込める', () => {
    const messages = [];
    const logger = { info: (m) => messages.push(m), warning: (m) => messages.push(m) };

    const config = loadConfig(`
high_risk_patterns:
  - ^inline/

low_risk_patterns:
  - pattern: \\.inline$
    label: インライン
`, logger);

    expect(config.highRiskPatterns).toHaveLength(1);
    expect(config.highRiskPatterns[0].test('inline/file.js')).toBe(true);
    expect(config.lowRiskPatterns[0].label).toBe('インライン');
    expect(messages.some(m => m.includes('インライン設定'))).toBe(true);
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
