'use strict';

const fs = require('fs');
const path = require('path');
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
 * 設定を読み込み、正規表現にコンパイルして返す。
 * 優先順位: インライン文字列 (configString) > ファイル (configPath) > デフォルト
 *
 * @param {{ configString?: string, configPath?: string }} options
 * @param {{ info: Function, warning: Function }} [logger] - ログ出力（GitHub Actions core 互換）
 * @returns {{ highRiskPatterns: RegExp[], lowRiskPatterns: { pattern: RegExp, label: string }[] }}
 */
function loadConfig(options, logger) {
  const log = logger || { info: () => {}, warning: () => {} };
  const { configString, configPath } = options || {};
  let raw;

  if (configString && configString.trim() !== '') {
    raw = YAML.parse(configString);
    log.info('インライン設定を読み込みました。');
  } else if (configPath && fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    raw = YAML.parse(content);
    log.info(`設定ファイルを読み込みました: ${configPath}`);
  } else {
    raw = DEFAULT_CONFIG;
    log.info('設定が見つかりません。デフォルトルールで動作します。');
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
