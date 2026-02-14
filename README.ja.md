# Drive Upload Action

[![CI](https://github.com/loppo-llc/drive-upload-action/actions/workflows/ci.yml/badge.svg)](https://github.com/loppo-llc/drive-upload-action/actions/workflows/ci.yml)

[English README](README.md)

Application Default Credentials (ADC) を使用して Google Drive に成果物をアップロードするシンプルで堅牢な JavaScript Action です。Workload Identity Federation (WIF) によるキーレス認証を推奨します。

- ファイルをそのままアップロード
- フォルダーを自動で ZIP 化してアップロード
- 共有ドライブ対応
- 一時障害時の指数バックオフ再試行
- 同名ファイル競合時の `overwrite` / `skip` / `error`
- ADC ベースの認証（WIF 推奨）

## 認証

この Action は [Application Default Credentials (ADC)](https://cloud.google.com/docs/authentication/application-default-credentials) を使用します。
実行前に [google-github-actions/auth](https://github.com/google-github-actions/auth) で認証を行ってください。

> **重要**: `google-github-actions/auth` の `create_credentials_file` が有効である必要があります（デフォルトで有効）。
> `create_credentials_file: false` を明示的に設定すると、この Action は動作しません。

> **セキュリティ Tips**: 本番ワークフローでは `google-github-actions/auth` をタグではなく特定のコミット SHA にピン留めすることを推奨します。

### 推奨: `credentials-file` を明示指定

```yaml
jobs:
  upload:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # Workload Identity Federation に必要
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/123456789/locations/global/workloadIdentityPools/my-pool/providers/my-provider'
          service_account: 'my-sa@my-project.iam.gserviceaccount.com'

      - name: Upload to Google Drive
        id: upload
        uses: loppo-llc/drive-upload-action@v2
        with:
          source: out
          parent-folder-id: ${{ secrets.GDRIVE_PARENT_FOLDER_ID }}
          credentials-file: ${{ steps.auth.outputs.credentials_file_path }}

      - name: Print uploaded file id
        run: echo "ID=${{ steps.upload.outputs.file-id }}"
```

### 簡易: 環境変数による自動検出

`credentials-file` を省略すると、`GOOGLE_APPLICATION_CREDENTIALS` 環境変数にフォールバックします（`google-github-actions/auth` が自動設定）。

> **Note**: セルフホストランナーでは環境変数が別プロセスで設定されている場合があります。意図しない認証情報の使用を避けるため、`credentials-file` の明示指定を推奨します。

```yaml
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: '...'
          service_account: '...'

      - name: Upload to Google Drive
        uses: loppo-llc/drive-upload-action@v2
        with:
          source: out
          parent-folder-id: ${{ secrets.GDRIVE_PARENT_FOLDER_ID }}
```

## v1 からの移行

v2 ではサービスアカウント JSON キー認証を廃止し、Workload Identity Federation に移行しました。

| v1 | v2 |
| --- | --- |
| `service-account-json` | 廃止。`google-github-actions/auth` + `credentials-file` を使用。 |
| `service-account-json-base64` | 廃止。 |
| `subject` | 廃止。WIF ではドメイン全体の委任は非対応。 |

### 移行手順

1. Google Cloud プロジェクトで [Workload Identity Federation を設定](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account)
2. `service-account-json` を `google-github-actions/auth` ステップに置き換え
3. ジョブに `permissions: id-token: write` を追加
4. この Action に `credentials-file: ${{ steps.auth.outputs.credentials_file_path }}` を渡す（推奨）

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
| `credentials-file` | no | - | Google Cloud 認証情報 JSON ファイルのパス。通常は `${{ steps.auth.outputs.credentials_file_path }}`。省略時は `GOOGLE_APPLICATION_CREDENTIALS` 環境変数を使用。 |
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

## Self-hosted runner 要件

- GitHub Actions Runner が Node.js 24 ランタイム対応バージョンであること
- Google Drive API へ HTTPS で疎通できること（`www.googleapis.com`, `oauth2.googleapis.com`）
- 一時 ZIP 作成のため、`RUNNER_TEMP` または OS 標準テンポラリディレクトリに書き込み可能であること

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
