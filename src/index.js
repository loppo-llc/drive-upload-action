const io = require('./io');

const { getInputs } = require('./input');
const { parseServiceAccountJson, createAuthClient } = require('./auth');
const { withRetry } = require('./retry');
const { prepareUploadSource } = require('./archive');
const {
  createDriveClient,
  listFilesByName,
  ensureFolderPath,
  deleteFile,
  getFileById,
  validateParentFolder,
  updateFile,
  uploadFile
} = require('./drive');

const defaultDeps = {
  io,
  getInputs,
  parseServiceAccountJson,
  createAuthClient,
  withRetry,
  prepareUploadSource,
  createDriveClient,
  listFilesByName,
  ensureFolderPath,
  deleteFile,
  getFileById,
  validateParentFolder,
  updateFile,
  uploadFile
};

async function run(customDeps = {}) {
  const deps = { ...defaultDeps, ...customDeps };
  let cleanup = async () => {};
  let runFailed = false;

  try {
    const inputs = deps.getInputs();
    const credentials = deps.parseServiceAccountJson({
      serviceAccountJson: inputs.serviceAccountJson,
      serviceAccountJsonBase64: inputs.serviceAccountJsonBase64
    });

    const auth = deps.createAuthClient({
      credentials,
      subject: inputs.subject
    });

    const drive = deps.createDriveClient(auth, inputs.requestTimeoutMs);

    await deps.withRetry(() => auth.authorize(), {
      maxRetries: inputs.maxRetries,
      initialDelayMs: inputs.initialRetryDelayMs
    });

    let targetParentId = inputs.parentFolderId;

    await deps.validateParentFolder({ drive, parentId: targetParentId });
    deps.io.info(`validated parent folder: ${targetParentId}`);
    if (inputs.folderPathSegments.length > 0) {
      targetParentId = await deps.ensureFolderPath({
        drive,
        rootParentId: targetParentId,
        folderPathSegments: inputs.folderPathSegments,
        driveId: inputs.driveId,
        withRetry: (operation) =>
          deps.withRetry(operation, {
            maxRetries: inputs.maxRetries,
            initialDelayMs: inputs.initialRetryDelayMs
          })
      });
    }

    deps.io.info(`source path resolved to: ${inputs.resolvedSourcePath}`);

    const prepared = await deps.prepareUploadSource({
      sourcePath: inputs.resolvedSourcePath,
      desiredName: inputs.name,
      archiveFolder: inputs.archiveFolder
    });

    cleanup = prepared.cleanup;

    const mimeType = inputs.mimeType || prepared.mimeType;
    const existing = await deps.withRetry(
      () =>
        deps.listFilesByName({
          drive,
          parentId: targetParentId,
          fileName: prepared.uploadName,
          driveId: inputs.driveId,
          folderOnly: false
        }),
      {
        maxRetries: inputs.maxRetries,
        initialDelayMs: inputs.initialRetryDelayMs
      }
    );

    if (existing.length > 0) {
      if (inputs.conflictBehavior === 'error') {
        throw new Error(
          `file '${prepared.uploadName}' already exists under parent '${targetParentId}'`
        );
      }

      if (inputs.conflictBehavior === 'skip') {
        const current = await deps.withRetry(
          () => deps.getFileById({ drive, fileId: existing[0].id }),
          {
            maxRetries: inputs.maxRetries,
            initialDelayMs: inputs.initialRetryDelayMs
          }
        );

        deps.io.info(`file already exists, skipping upload: ${current.id}`);
        setOutputs(current, mimeType, Number(current.size || prepared.sizeBytes), deps.io.setOutput);
        return;
      }

      const targetFile = existing[0];

      deps.io.info(`updating existing file ${targetFile.id} with new content`);
      const updated = await deps.withRetry(
        () =>
          deps.updateFile({
            drive,
            fileId: targetFile.id,
            uploadPath: prepared.uploadPath,
            uploadName: prepared.uploadName,
            mimeType
          }),
        {
          maxRetries: inputs.maxRetries,
          initialDelayMs: inputs.initialRetryDelayMs
        }
      );

      if (existing.length > 1) {
        deps.io.info(`deleting ${existing.length - 1} duplicate file(s) named '${prepared.uploadName}'`);
        for (const file of existing.slice(1)) {
          await deps.withRetry(() => deps.deleteFile({ drive, fileId: file.id }), {
            maxRetries: inputs.maxRetries,
            initialDelayMs: inputs.initialRetryDelayMs
          });
        }
      }

      deps.io.info(`updated file '${updated.name}' with id ${updated.id}`);
      setOutputs(updated, mimeType, prepared.sizeBytes, deps.io.setOutput);
      return;
    }

    const uploaded = await deps.withRetry(
      () =>
        deps.uploadFile({
          drive,
          uploadPath: prepared.uploadPath,
          uploadName: prepared.uploadName,
          mimeType,
          parentId: targetParentId
        }),
      {
        maxRetries: inputs.maxRetries,
        initialDelayMs: inputs.initialRetryDelayMs
      }
    );

    deps.io.info(`uploaded file '${uploaded.name}' with id ${uploaded.id}`);
    setOutputs(uploaded, mimeType, prepared.sizeBytes, deps.io.setOutput);
  } catch (error) {
    runFailed = true;
    deps.io.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      deps.io.warning(`cleanup failed: ${message}`);
      if (!runFailed) {
        deps.io.setFailed(`cleanup failed: ${message}`);
      }
    }
  }
}

function setOutputs(file, mimeType, fallbackSizeBytes, setOutput = io.setOutput) {
  setOutput('file-id', file.id);
  setOutput('file-name', file.name);
  setOutput('mime-type', file.mimeType || mimeType);
  setOutput('size-bytes', file.size || String(fallbackSizeBytes));
  setOutput('web-view-link', file.webViewLink || '');
  setOutput('web-content-link', file.webContentLink || '');
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  setOutputs
};
