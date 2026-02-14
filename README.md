# Drive Upload Action

[![CI](https://github.com/loppo-llc/drive-upload-action/actions/workflows/ci.yml/badge.svg)](https://github.com/loppo-llc/drive-upload-action/actions/workflows/ci.yml)

[日本語版 README はこちら](README.ja.md)

A simple and robust JavaScript Action for uploading artifacts to Google Drive via Application Default Credentials (ADC). Workload Identity Federation (WIF) is recommended for keyless, secret-free authentication.

- Upload files as-is
- Automatically zip and upload folders
- Shared Drive support
- Exponential backoff retry on transient failures
- Configurable conflict behavior: `overwrite` / `skip` / `error`
- ADC-based authentication (WIF recommended)

## Authentication

This Action uses [Application Default Credentials (ADC)](https://cloud.google.com/docs/authentication/application-default-credentials).
Use [google-github-actions/auth](https://github.com/google-github-actions/auth) to authenticate before running this Action.

> **Important**: `google-github-actions/auth` must have `create_credentials_file` enabled (this is the default).
> If you explicitly set `create_credentials_file: false`, this Action will not work.

> **Security tip**: For production workflows, pin `google-github-actions/auth` to a specific commit SHA instead of a tag.

### Recommended: explicit `credentials-file`

```yaml
jobs:
  upload:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # Required for Workload Identity Federation
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

### Simple: auto-detect via environment variable

When `credentials-file` is omitted, the Action falls back to the `GOOGLE_APPLICATION_CREDENTIALS` environment variable (automatically set by `google-github-actions/auth`).

> **Note**: On self-hosted runners, the environment variable may be set by another process. Prefer explicit `credentials-file` to avoid picking up unintended credentials.

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

## Migrating from v1

v2 removes service account JSON key authentication in favor of Workload Identity Federation.

| v1 | v2 |
| --- | --- |
| `service-account-json` | Removed. Use `google-github-actions/auth` + `credentials-file` instead. |
| `service-account-json-base64` | Removed. |
| `subject` | Removed. Domain-wide delegation is not supported with WIF. |

### Migration steps

1. [Set up Workload Identity Federation](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account) in your Google Cloud project
2. Replace `service-account-json` with a `google-github-actions/auth` step
3. Add `permissions: id-token: write` to your job
4. Pass `credentials-file: ${{ steps.auth.outputs.credentials_file_path }}` to this Action (recommended)

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `source` | yes | - | Path to the file or folder to upload |
| `name` | no | - | File name on Drive (defaults to the original file/folder name + .zip) |
| `mime-type` | no | auto | Explicitly specify the MIME type |
| `parent-folder-id` | no | `root` | Parent folder ID for the upload destination |
| `folder-path` | no | - | Sub-folder path to create/resolve under the parent folder (e.g. `release/nightly`) |
| `drive-id` | no | - | Shared Drive ID (used as the search scope) |
| `archive-folder` | no | `true` | Whether to zip when `source` is a folder |
| `conflict-behavior` | no | `overwrite` | Behavior when a file with the same name exists: `overwrite` / `skip` / `error` |
| `credentials-file` | no | - | Path to Google Cloud credentials JSON file. Typically `${{ steps.auth.outputs.credentials_file_path }}`. Falls back to `GOOGLE_APPLICATION_CREDENTIALS` env var. |
| `max-retries` | no | `5` | Maximum number of retries on transient failures |
| `initial-retry-delay-ms` | no | `1000` | Initial retry delay in milliseconds |
| `request-timeout-ms` | no | `120000` | Drive API request timeout in milliseconds |

## Outputs

- `file-id`
- `file-name`
- `mime-type`
- `size-bytes`
- `web-view-link`
- `web-content-link`

## Conflict behavior and destructive operations

The `conflict-behavior` setting controls what happens when a file with the same name already exists.

| Value | Description |
| --- | --- |
| `overwrite` (default) | **Updates the existing file in-place** using `drive.files.update`, preserving file ID, version history, and sharing settings. If multiple files share the same name, the most recently modified one is updated and the rest are permanently deleted. |
| `skip` | Keeps the existing file and skips the upload. |
| `error` | Fails the Action if a file with the same name exists. |

> **Note**: `overwrite` preserves the file ID and Google Drive version history. If duplicate files with the same name exist, the extras are **permanently deleted** (not moved to trash). When used with Shared Drives, always test in a dedicated test folder before using in production.

## Required permissions

This Action requires the `https://www.googleapis.com/auth/drive` scope. This grants **full access** to Google Drive.

It is recommended to limit the service account's permissions via folder sharing settings:

- Share only the target upload folder with the service account as "Editor"
- Share specific folders rather than the entire Shared Drive

## Self-hosted runner requirements

- The GitHub Actions Runner must support the Node.js 24 runtime
- HTTPS connectivity to the Google Drive API (`www.googleapis.com`, `oauth2.googleapis.com`)
- Write access to `RUNNER_TEMP` or the OS default temporary directory for creating temporary ZIP files

## Local development

```bash
npm ci
npm run lint
npm test
npm run build:dev
npm run build:release
```

- `npm run build:dev`: Development build (with source maps)
- `npm run build:release`: Distribution build (without source maps)
- `npm run build`: Alias for `build:release`

Before opening a PR, run `npm run build` and commit the `dist/` changes.

## License

[MIT](LICENSE)
