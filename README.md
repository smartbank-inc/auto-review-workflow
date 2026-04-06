# auto-review-workflow

PR の変更内容を自動評価し、低リスクな変更にはレビュー不要ラベルの付与と自動承認を行う Reusable GitHub Actions Workflow。

## 使い方

### 1. 呼び出し用ワークフローを作成

利用リポジトリに `.github/workflows/auto-review.yml` を作成:

```yaml
name: Auto Review Evaluation

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: auto-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  evaluate:
    uses: smartbank-inc/auto-review-workflow/.github/workflows/evaluate.yml@main
    with:
      config-path: ".github/auto-review-config.yml"
      team-slug: "developer"
    secrets:
      app-id: ${{ secrets.SMARTBANK_AUTO_MERGE_BOT_APP_ID }}
      app-private-key: ${{ secrets.SMARTBANK_AUTO_MERGE_BOT_PRIVATE_KEY }}
```

### 2. 設定ファイル（オプション）

`.github/auto-review-config.yml` でリポジトリ固有のパターンを定義できます。
設定ファイルがない場合はデフォルトルールで動作します。

サンプル: [examples/config.yml](./examples/config.yml)

### 3. GitHub App の設定

以下の権限を持つ GitHub App を作成し、secrets に登録してください:

- `Organization > Members: read`
- `Repository > Pull requests: read & write`
- `Repository > Issues: write`
- `Repository > Contents: read`

| Secret                                 | 説明              |
| -------------------------------------- | ----------------- |
| `SMARTBANK_AUTO_MERGE_BOT_APP_ID`      | GitHub App ID     |
| `SMARTBANK_AUTO_MERGE_BOT_PRIVATE_KEY` | GitHub App 秘密鍵 |

## 判定ロジック

以下の条件を **すべて** 満たす場合、レビュー不要と判定します:

1. PR 作成者が指定チームのメンバーである
2. 高リスクパターンに該当するファイルが **1 つもない**
3. すべての変更ファイルが低リスクパターンの **いずれかに該当する**

## Inputs

| Input         | デフォルト                                                | 説明                                                   |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `config`      | `""`                                                      | YAML文字列で設定を直接指定（指定時は config-path より優先） |
| `config-path` | `.github/auto-review-config.yml`                          | 設定ファイルのパス（`config` 未指定時に使用）          |
| `team-slug`   | `developer`                                               | チェック対象の GitHub Team                             |
| `org`         | `smartbank-inc`                                           | GitHub Organization 名                                 |
| `label-name`  | `auto-review`                                             | 付与するラベル名                                       |
| `skip-actors` | `dependabot[bot],renovate[bot],devin-ai-integration[bot]` | スキップする actor（カンマ区切り）                     |

### インライン config の例

設定ファイルを作成する代わりに、呼び出し YAML にヒアドキュメントで直接書けます。

```yaml
jobs:
  evaluate:
    uses: smartbank-inc/auto-review-workflow/.github/workflows/evaluate.yml@main
    with:
      team-slug: "developer"
      config: |
        high_risk_patterns:
          - ^app/
          - ^lib/
          - ^\.github/
          - ^Gemfile$
        low_risk_patterns:
          - pattern: \.md$
            label: ドキュメント (Markdown)
          - pattern: ^spec/
            label: テストコード
    secrets:
      app-id: ${{ secrets.SMARTBANK_AUTO_MERGE_BOT_APP_ID }}
      app-private-key: ${{ secrets.SMARTBANK_AUTO_MERGE_BOT_PRIVATE_KEY }}
```

## デフォルトルール

設定ファイルがない場合、以下のプリセットで動作します:

**高リスク:** `app/`, `lib/`, `src/`, `config/`, `db/`, `.github/`, `Gemfile`, `Gemfile.lock`

**低リスク:** `*.md`, `docs/`, `spec/`, `test/`, `*.rbs`

## 開発

```bash
npm install   # 依存パッケージのインストール
npm test      # テスト実行（vitest）
```
