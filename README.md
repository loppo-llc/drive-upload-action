# Drive Upload Action

[![CI](https://github.com/loppo-llc/drive-upload-action/actions/workflows/ci.yml/badge.svg)](https://github.com/loppo-llc/drive-upload-action/actions/workflows/ci.yml)

[日本語版 README はこちら](README.ja.md)

A simple and robust JavaScript Action for uploading artifacts to Google Drive.

- Upload files as-is
- Automatically zip and upload folders
- Shared Drive support
- Exponential backoff retry on transient failures
- Configurable conflict behavior: `overwrite` / `skip` / `error`

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `source` | yes | - | Path to the file or folder to upload |
| `name` | no | - | File name on Drive (defaults to the original file/folder name + .zip) |
| `mime-type` | no | auto | Explicitly specify the MIME type |
| `parent-folder-id` | no | `root` | Parent folder ID for the upload destination. Multiple IDs can be specified separated by commas or newlines to upload the same file to multiple folders. |
| `folder-path` | no | - | Sub-folder path to create/resolve under the parent folder (e.g. `release/nightly`) |
| `drive-id` | no | - | Shared Drive ID (used as the search scope) |
| `archive-folder` | no | `true` | Whether to zip when `source` is a folder |
| `conflict-behavior` | no | `overwrite` | Behavior when a file with the same name exists: `overwrite` / `skip` / `error` |
| `service-account-json` | no | - | Google service account JSON |
| `service-account-json-base64` | no | - | Base64-encoded service account JSON |
| `subject` | no | - | Email address for Domain-wide Delegation impersonation |
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

When multiple `parent-folder-id` values are given, the scalar outputs above reflect the first destination, and the following newline-separated outputs are populated in input order:

- `file-ids`
- `file-names`
- `mime-types`
- `size-bytes-list`
- `web-view-links`
- `web-content-links`

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

### Upload to multiple folders

```yaml
      - name: Upload to multiple Drive folders
        id: upload
        uses: loppo-llc/drive-upload-action@v1
        with:
          source: out
          parent-folder-id: |
            ${{ secrets.GDRIVE_FOLDER_A }}
            ${{ secrets.GDRIVE_FOLDER_B }}
          service-account-json: ${{ secrets.GDRIVE_SERVICE_ACCOUNT_JSON }}

      - name: Print all uploaded file ids
        run: echo "${{ steps.upload.outputs.file-ids }}"
```

Notes on multi-destination behavior:

- Duplicate IDs are deduplicated (first occurrence wins). The plural outputs have one line per unique destination, in input order.
- The same local file is uploaded to each destination sequentially. There is no server-side `files.copy` optimization, so byte transfer is proportional to the number of destinations.
- With `conflict-behavior=overwrite` or `skip`, destinations are processed in order. If one destination fails after earlier writes have succeeded, the earlier writes are **not** rolled back.
- With `conflict-behavior=error`, all destinations are checked for conflicts up front. If any destination already has a file with the target name, the run fails before any upload/update happens. Note that when `folder-path` is set, intermediate folders may still be created under each parent as a side effect of the preflight resolution.

## Conflict behavior and destructive operations

The `conflict-behavior` setting controls what happens when a file with the same name already exists.

| Value | Description |
| --- | --- |
| `overwrite` (default) | **Updates the existing file in-place** using `drive.files.update`, preserving file ID, version history, and sharing settings. If multiple files share the same name, the most recently modified one is updated and the rest are permanently deleted. |
| `skip` | Keeps the existing file and skips the upload. |
| `error` | Fails the Action if a file with the same name exists. |

> **Note**: `overwrite` preserves the file ID and Google Drive version history. If duplicate files with the same name exist, the extras are **permanently deleted** (not moved to trash). When used with Shared Drives, always test in a dedicated test folder before using in production.

## Required permissions

This Action requires the `https://www.googleapis.com/auth/drive` scope for the service account. This grants **full access** to Google Drive.

It is recommended to limit the service account's permissions via folder sharing settings:

- Share only the target upload folder with the service account as "Editor"
- Share specific folders rather than the entire Shared Drive

## Credential Setup

1. Create a service account in Google Cloud
2. Share the target Drive (My Drive or Shared Drive) with the service account
3. Store the JSON key in GitHub Secrets
4. Pass either `service-account-json` or `service-account-json-base64` to the Action

## Self-hosted runner requirements

- The GitHub Actions Runner must support the Node.js 24 runtime
- HTTPS connectivity to the Google Drive API (`www.googleapis.com`, `oauth2.googleapis.com`)
- Write access to `RUNNER_TEMP` or the OS default temporary directory for creating temporary ZIP files
- The service account JSON must always be passed via Secrets and never printed to logs

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
