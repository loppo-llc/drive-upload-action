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

    const parentFolderIds = inputs.parentFolderIds || [inputs.parentFolderId];

    for (const parentId of parentFolderIds) {
      await deps.validateParentFolder({ drive, parentId });
      deps.io.info(`validated parent folder: ${parentId}`);
    }

    deps.io.info(`source path resolved to: ${inputs.resolvedSourcePath}`);

    const prepared = await deps.prepareUploadSource({
      sourcePath: inputs.resolvedSourcePath,
      desiredName: inputs.name,
      archiveFolder: inputs.archiveFolder
    });

    cleanup = prepared.cleanup;

    const mimeType = inputs.mimeType || prepared.mimeType;

    const targets = [];
    for (const parentId of parentFolderIds) {
      const target = await resolveDestination({ deps, drive, rootParentId: parentId, inputs, prepared });
      targets.push(target);
    }

    if (inputs.conflictBehavior === 'error') {
      for (const target of targets) {
        if (target.existing.length > 0) {
          throw new Error(
            `file '${prepared.uploadName}' already exists under parent '${target.targetParentId}'`
          );
        }
      }
    }

    const results = [];
    for (const target of targets) {
      const result = await applyDestination({ deps, drive, target, inputs, prepared, mimeType });
      results.push(result);
    }

    setOutputs(results, mimeType, prepared.sizeBytes, deps.io.setOutput);
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

async function resolveDestination({ deps, drive, rootParentId, inputs, prepared }) {
  let targetParentId = rootParentId;

  if (inputs.folderPathSegments.length > 0) {
    targetParentId = await deps.ensureFolderPath({
      drive,
      rootParentId,
      folderPathSegments: inputs.folderPathSegments,
      driveId: inputs.driveId,
      withRetry: (operation) =>
        deps.withRetry(operation, {
          maxRetries: inputs.maxRetries,
          initialDelayMs: inputs.initialRetryDelayMs
        })
    });
  }

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

  return { rootParentId, targetParentId, existing };
}

async function applyDestination({ deps, drive, target, inputs, prepared, mimeType }) {
  const { targetParentId, existing } = target;

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

      deps.io.info(`file already exists under '${targetParentId}', skipping upload: ${current.id}`);
      return {
        file: current,
        sizeBytes: Number(current.size || prepared.sizeBytes)
      };
    }

    const targetFile = existing[0];

    deps.io.info(`updating existing file ${targetFile.id} under '${targetParentId}' with new content`);
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
      deps.io.info(
        `deleting ${existing.length - 1} duplicate file(s) named '${prepared.uploadName}' under '${targetParentId}'`
      );
      for (const file of existing.slice(1)) {
        await deps.withRetry(() => deps.deleteFile({ drive, fileId: file.id }), {
          maxRetries: inputs.maxRetries,
          initialDelayMs: inputs.initialRetryDelayMs
        });
      }
    }

    deps.io.info(`updated file '${updated.name}' with id ${updated.id} under '${targetParentId}'`);
    return { file: updated, sizeBytes: prepared.sizeBytes };
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

  deps.io.info(`uploaded file '${uploaded.name}' with id ${uploaded.id} under '${targetParentId}'`);
  return { file: uploaded, sizeBytes: prepared.sizeBytes };
}

function setOutputs(results, mimeType, fallbackSizeBytes, setOutput = io.setOutput) {
  const list = Array.isArray(results) ? results : [{ file: results, sizeBytes: fallbackSizeBytes }];
  const first = list[0];
  const firstFile = first.file;
  const firstSize = first.sizeBytes;

  setOutput('file-id', firstFile.id);
  setOutput('file-name', firstFile.name);
  setOutput('mime-type', firstFile.mimeType || mimeType);
  setOutput('size-bytes', firstFile.size || String(firstSize));
  setOutput('web-view-link', firstFile.webViewLink || '');
  setOutput('web-content-link', firstFile.webContentLink || '');

  const join = (values) => values.join('\n');
  setOutput('file-ids', join(list.map((r) => r.file.id)));
  setOutput('file-names', join(list.map((r) => r.file.name)));
  setOutput('mime-types', join(list.map((r) => r.file.mimeType || mimeType)));
  setOutput('size-bytes-list', join(list.map((r) => r.file.size || String(r.sizeBytes))));
  setOutput('web-view-links', join(list.map((r) => r.file.webViewLink || '')));
  setOutput('web-content-links', join(list.map((r) => r.file.webContentLink || '')));
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
  setOutputs
};
