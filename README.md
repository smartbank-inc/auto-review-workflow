# auto-review-workflow

PR の変更内容を自動評価し、低リスクな変更にはレビュー不要ラベルの付与と自動承認を行う Reusable GitHub Actions Workflow。

## 使い方

### 1. 呼び出し用ワークフローを作成

利用リポジトリに `.github/workflows/auto-review.yml` を作成します。設定は `config` input にインライン YAML で指定します（省略時はデフォルトルール）。

```yaml
name: Auto Review

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
      team-slug: "developer"
      config: |
        high_risk_patterns:
          - ^app/
          - ^lib/
          - ^config/
          - ^db/
          - ^Gemfile$
          - ^Gemfile\.lock$
        low_risk_patterns:
          - pattern: \.md$
            label: ドキュメント (Markdown)
          - pattern: ^docs/
            label: docs ディレクトリ
          - pattern: ^spec/
            label: テストコード
          - pattern: \.rbs$
            label: RBS 型定義
          - pattern: ^\.claude/
            label: エージェント設定 (.claude/)
          - pattern: ^\.github/workflows/
            label: GitHub Actions ワークフロー
            actions_update_excluded: true
        pr_level_low_risk_rules:
          - revert_title
          - deletion_only
          - rename_only
    secrets:
      app-id: ${{ secrets.SMARTBANK_AUTO_MERGE_BOT_APP_ID }}
      app-private-key: ${{ secrets.SMARTBANK_AUTO_MERGE_BOT_PRIVATE_KEY }}
```

### 2. GitHub App の設定

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

以下のいずれかを満たす場合、レビュー不要と判定します:

1. **リリースブランチ向けPRでなく**、かつ PR 作成者が指定チームのメンバーであり、かつ
   - **PR形状ルール**（`pr_level_low_risk_rules`）のいずれかに該当する（高リスクパスより優先）
     - `revert_title`: PRタイトルが GitHub標準の `Revert "..."` 形式
     - `deletion_only`: 全変更ファイルが追加行なし（削除のみ）
     - `rename_only`: 全変更ファイルが内容変更を伴わない rename/move のみ
   - または、上記に該当せず、かつ
     - 高リスクパターンに該当するファイルが **1 つもない**
     - すべての変更ファイルが低リスクパターンの **いずれかに該当する**
     - `actions_update_excluded: true` な低リスクパターンに該当したファイルは、
       diffが GitHub Actions のバージョン参照（`uses:`）行の変更のみの場合、
       低リスク扱いから除外される（サプライチェーンリスクのため）

**新設**: develop→main のようなリリースブランチへのPRは、`release-base-ref`
（デフォルト `main`）に一致する場合、上記のどの条件にも関わらず対象外になります。

## Inputs

| Input         | デフォルト                                                | 説明                                        |
| ------------- | --------------------------------------------------------- | ------------------------------------------- |
| `config`      | `""`                                                      | YAML文字列で設定を指定（未指定時はデフォルト） |
| `team-slug`   | `developer`                                               | チェック対象の GitHub Team                  |
| `org`         | `smartbank-inc`                                           | GitHub Organization 名                      |
| `label-name`  | `auto-review`                                             | 付与するラベル名                            |
| `skip-actors` | `dependabot[bot],renovate[bot],devin-ai-integration[bot]` | スキップする actor（カンマ区切り）          |
| `release-base-ref` | `main`                                                     | このブランチ向けのPRを自動承認対象外にする（空文字列で無効化） |

## デフォルトルール

`config` を指定しない場合、以下のプリセットで動作します:

**高リスク:** `app/`, `lib/`, `src/`, `config/`, `db/`, `.github/`, `Gemfile`, `Gemfile.lock`

**低リスク:** `*.md`, `docs/`, `spec/`, `test/`, `*.rbs`

## 開発

```bash
npm install   # 依存パッケージのインストール
npm test      # テスト実行（vitest）
```
