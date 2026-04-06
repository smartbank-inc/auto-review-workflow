'use strict';

const YAML = require('yaml');

const DEFAULT_CONFIG = {
  high_risk_patterns: [
    '^app/', '^lib/', '^src/', '^config/', '^db/',
    '^\\.github/', '^Gemfile$', '^Gemfile\\.lock$',
  ],
  low_risk_patterns: [
    { pattern: '\\.md$', label: 'ドキュメント (Markdown)' },
    { pattern: '^docs/', label: 'docs ディレクトリ' },
    { pattern: '^spec/', label: 'テストコード' },
    { pattern: '^test/', label: 'テストコード' },
    { pattern: '\\.rbs$', label: 'RBS 型定義' },
  ],
};

/**
 * インライン YAML 文字列から設定を読み込み、正規表現にコンパイルして返す。
 * 空文字列の場合はデフォルト設定を使用する。
 *
 * @param {string} configString - YAML文字列
 * @param {{ info: Function, warning: Function }} [logger] - ログ出力（GitHub Actions core 互換）
 * @returns {{ highRiskPatterns: RegExp[], lowRiskPatterns: { pattern: RegExp, label: string }[] }}
 */
function loadConfig(configString, logger) {
  const log = logger || { info: () => {}, warning: () => {} };
  let raw;

  if (configString && configString.trim() !== '') {
    raw = YAML.parse(configString);
    log.info('インライン設定を読み込みました。');
  } else {
    raw = DEFAULT_CONFIG;
    log.info('config 未指定のため、デフォルトルールで動作します。');
  }

  return compileConfig(raw);
}

/**
 * 生の設定オブジェクトを正規表現にコンパイルする。
 *
 * @param {Object} raw
 * @returns {{ highRiskPatterns: RegExp[], lowRiskPatterns: { pattern: RegExp, label: string }[] }}
 */
function compileConfig(raw) {
  const highRiskPatterns = (raw.high_risk_patterns || []).map(p => new RegExp(p));

  const lowRiskPatterns = (raw.low_risk_patterns || []).map(entry => {
    if (typeof entry === 'string') {
      return { pattern: new RegExp(entry), label: entry };
    }
    return { pattern: new RegExp(entry.pattern), label: entry.label || entry.pattern };
  });

  return { highRiskPatterns, lowRiskPatterns };
}

module.exports = { loadConfig, compileConfig, DEFAULT_CONFIG };
