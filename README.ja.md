# Drive Upload Action

[![CI](https://github.com/loppo-llc/drive-upload-action/actions/workflows/ci.yml/badge.svg)](https://github.com/loppo-llc/drive-upload-action/actions/workflows/ci.yml)

[English README](README.md)

Google Drive に成果物をアップロードするシンプルで堅牢な JavaScript Action です。

- ファイルをそのままアップロード
- フォルダーを自動で ZIP 化してアップロード
- 共有ドライブ対応
- 一時障害時の指数バックオフ再試行
- 同名ファイル競合時の `overwrite` / `skip` / `error`

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `source` | yes | - | アップロード対象のファイル or フォルダーのパス |
| `name` | no | - | Drive 上のファイル名（未指定時は元ファイル名/フォルダー名.zip） |
| `mime-type` | no | auto | MIME type の明示指定 |
| `parent-folder-id` | no | `root` | アップロード先親フォルダー ID |
| `folder-path` | no | - | 親フォルダー配下に作成/解決するサブフォルダー（例: `release/nightly`） |
| `drive-id` | no | - | 共有ドライブ ID（検索スコープに使用） |
| `archive-folder` | no | `true` | `source` がフォルダーのとき ZIP 化するか |
| `conflict-behavior` | no | `overwrite` | 同名ファイル存在時の挙動: `overwrite` / `skip` / `error` |
| `service-account-json` | no | - | Google サービスアカウント JSON |
| `service-account-json-base64` | no | - | base64 化済みサービスアカウント JSON |
| `subject` | no | - | Domain-wide delegation の impersonation 対象メール |
| `max-retries` | no | `5` | 一時障害時の最大再試行回数 |
| `initial-retry-delay-ms` | no | `1000` | 初回リトライ待機(ms) |
| `request-timeout-ms` | no | `120000` | Drive API リクエストタイムアウト(ms) |

## Outputs

- `file-id`
- `file-name`
- `mime-type`
- `size-bytes`
- `web-view-link`
- `web-content-link`

## Usage

```yaml
name: Upload Artifact to Drive

on:
  workflow_dispatch:

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build artifact
        run: |
          mkdir -p out
          echo hello > out/hello.txt

      - name: Upload to Google Drive
        id: upload
        uses: loppo-llc/drive-upload-action@v1
        with:
          source: out
          parent-folder-id: ${{ secrets.GDRIVE_PARENT_FOLDER_ID }}
          folder-path: releases/nightly
          conflict-behavior: overwrite
          service-account-json: ${{ secrets.GDRIVE_SERVICE_ACCOUNT_JSON }}

      - name: Print uploaded file id
        run: echo "ID=${{ steps.upload.outputs.file-id }}"
```

## Conflict behavior and destructive operations

`conflict-behavior` の設定により、同名ファイルが既に存在する場合の挙動が変わります。

| Value | Description |
| --- | --- |
| `overwrite` (default) | **既存ファイルを `drive.files.update` で上書き更新します。** ファイル ID・バージョン履歴・共有設定が維持されます。同名ファイルが複数存在する場合、最新のものを更新し、残りは完全削除されます。 |
| `skip` | 既存ファイルをそのまま残し、アップロードをスキップします。 |
| `error` | 同名ファイルが存在する場合、Action を失敗させます。 |

> **Note**: `overwrite` はファイル ID と Google Drive のバージョン履歴を維持します。同名の重複ファイルが存在する場合、余分なファイルは**完全削除**（ゴミ箱ではなく即時削除）されます。共有ドライブで使用する場合は、本番運用前に必ずテストフォルダーで動作を確認してください。

## Required permissions

この Action はサービスアカウントに `https://www.googleapis.com/auth/drive` スコープを要求します。これは Google Drive への**フルアクセス権限**です。

サービスアカウントの権限は対象フォルダーへの共有設定で制限することを推奨します:

- アップロード先フォルダーにのみサービスアカウントを「編集者」として共有
- 共有ドライブ全体ではなく、特定フォルダーに限定して共有

## Credential Setup

1. Google Cloud でサービスアカウントを作成
2. 対象Drive（マイドライブ or 共有ドライブ）へサービスアカウントを共有
3. JSON キーを GitHub Secrets に保存
4. Action には `service-account-json` か `service-account-json-base64` のどちらかを渡す

## Self-hosted runner 要件

- GitHub Actions Runner が Node.js 24 ランタイム対応バージョンであること
- Google Drive API へ HTTPS で疎通できること（`www.googleapis.com`, `oauth2.googleapis.com`）
- 一時 ZIP 作成のため、`RUNNER_TEMP` または OS 標準テンポラリディレクトリに書き込み可能であること
- サービスアカウント JSON は必ず Secret 経由で渡し、ログへ出力しないこと

## Local development

```bash
npm ci
npm run lint
npm test
npm run build:dev
npm run build:release
```

- `npm run build:dev`: 開発向け（source map あり）
- `npm run build:release`: 配布向け（source map なし）
- `npm run build`: `build:release` のエイリアス

PR 前は `npm run build` を実行して `dist/` 差分をコミットしてください。

## License

[MIT](LICENSE)
