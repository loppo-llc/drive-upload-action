const test = require('node:test');
const assert = require('node:assert/strict');

const { run } = require('../src/index');

function createHarness({
  conflictBehavior,
  existing,
  currentFile,
  uploadedFile,
  updatedFile,
  cleanupShouldFail = false
}) {
  const deletedIds = [];
  const updatedCalls = [];
  const outputs = new Map();
  const failedMessages = [];
  const infos = [];
  const warnings = [];
  let uploadCount = 0;
  let cleanupCount = 0;

  const deps = {
    io: {
      info: (message) => infos.push(message),
      warning: (message) => warnings.push(message),
      setFailed: (message) => failedMessages.push(message),
      setOutput: (name, value) => outputs.set(name, String(value))
    },
    getInputs: () => ({
      sourceInput: 'dummy.txt',
      resolvedSourcePath: '/tmp/dummy.txt',
      name: undefined,
      mimeType: undefined,
      parentFolderId: 'root',
      folderPathInput: undefined,
      folderPathSegments: [],
      driveId: undefined,
      archiveFolder: true,
      conflictBehavior,
      serviceAccountJson: '{"client_email":"a@example.com","private_key":"k"}',
      serviceAccountJsonBase64: undefined,
      subject: undefined,
      maxRetries: 0,
      initialRetryDelayMs: 0,
      requestTimeoutMs: 1000
    }),
    parseServiceAccountJson: () => ({ client_email: 'a@example.com', private_key: 'k' }),
    createAuthClient: () => ({ authorize: async () => ({}) }),
    withRetry: async (operation) => operation(),
    prepareUploadSource: async () => ({
      uploadPath: '/tmp/dummy.txt',
      uploadName: 'dummy.txt',
      mimeType: 'text/plain',
      sizeBytes: 12,
      cleanup: async () => {
        cleanupCount += 1;
        if (cleanupShouldFail) {
          throw new Error('cleanup boom');
        }
      }
    }),
    createDriveClient: () => ({ files: {} }),
    listFilesByName: async () => existing,
    ensureFolderPath: async () => {
      throw new Error('ensureFolderPath should not be called in this test');
    },
    deleteFile: async ({ fileId }) => {
      deletedIds.push(fileId);
    },
    getFileById: async () => currentFile,
    updateFile: async (args) => {
      updatedCalls.push(args);
      return updatedFile;
    },
    uploadFile: async () => {
      uploadCount += 1;
      return uploadedFile;
    }
  };

  return {
    deps,
    deletedIds,
    updatedCalls,
    outputs,
    failedMessages,
    infos,
    warnings,
    getUploadCount: () => uploadCount,
    getCleanupCount: () => cleanupCount
  };
}

test('run handles conflict-behavior=error', async () => {
  const harness = createHarness({
    conflictBehavior: 'error',
    existing: [{ id: 'old-1' }],
    currentFile: undefined,
    uploadedFile: undefined
  });

  await run(harness.deps);

  assert.equal(harness.failedMessages.length, 1);
  assert.match(harness.failedMessages[0], /already exists/);
  assert.equal(harness.getUploadCount(), 0);
  assert.deepEqual(harness.deletedIds, []);
  assert.equal(harness.getCleanupCount(), 1);
  assert.equal(harness.outputs.size, 0);
});

test('run handles conflict-behavior=skip', async () => {
  const harness = createHarness({
    conflictBehavior: 'skip',
    existing: [{ id: 'old-1' }],
    currentFile: {
      id: 'old-1',
      name: 'dummy.txt',
      mimeType: 'text/plain',
      size: '21',
      webViewLink: 'https://example/view',
      webContentLink: 'https://example/content'
    },
    uploadedFile: undefined
  });

  await run(harness.deps);

  assert.equal(harness.failedMessages.length, 0);
  assert.equal(harness.getUploadCount(), 0);
  assert.deepEqual(harness.deletedIds, []);
  assert.equal(harness.outputs.get('file-id'), 'old-1');
  assert.equal(harness.outputs.get('file-name'), 'dummy.txt');
  assert.equal(harness.outputs.get('mime-type'), 'text/plain');
  assert.equal(harness.outputs.get('size-bytes'), '21');
  assert.equal(harness.getCleanupCount(), 1);
});

test('run handles conflict-behavior=overwrite by updating existing file', async () => {
  const harness = createHarness({
    conflictBehavior: 'overwrite',
    existing: [{ id: 'old-1' }],
    currentFile: undefined,
    uploadedFile: undefined,
    updatedFile: {
      id: 'old-1',
      name: 'dummy.txt',
      mimeType: 'text/plain',
      size: '99',
      webViewLink: 'https://example/view/updated',
      webContentLink: 'https://example/content/updated'
    }
  });

  await run(harness.deps);

  assert.equal(harness.failedMessages.length, 0);
  assert.equal(harness.getUploadCount(), 0);
  assert.equal(harness.updatedCalls.length, 1);
  assert.equal(harness.updatedCalls[0].fileId, 'old-1');
  assert.deepEqual(harness.deletedIds, []);
  assert.equal(harness.outputs.get('file-id'), 'old-1');
  assert.equal(harness.outputs.get('size-bytes'), '99');
  assert.equal(harness.getCleanupCount(), 1);
});

test('run handles conflict-behavior=overwrite with duplicates', async () => {
  const harness = createHarness({
    conflictBehavior: 'overwrite',
    existing: [{ id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }],
    currentFile: undefined,
    uploadedFile: undefined,
    updatedFile: {
      id: 'old-1',
      name: 'dummy.txt',
      mimeType: 'text/plain',
      size: '99',
      webViewLink: 'https://example/view/updated',
      webContentLink: 'https://example/content/updated'
    }
  });

  await run(harness.deps);

  assert.equal(harness.failedMessages.length, 0);
  assert.equal(harness.getUploadCount(), 0);
  assert.equal(harness.updatedCalls.length, 1);
  assert.equal(harness.updatedCalls[0].fileId, 'old-1');
  assert.deepEqual(harness.deletedIds, ['old-2', 'old-3']);
  assert.equal(harness.outputs.get('file-id'), 'old-1');
  assert.equal(harness.getCleanupCount(), 1);
});

test('run sets failure when cleanup fails after successful upload', async () => {
  const harness = createHarness({
    conflictBehavior: 'overwrite',
    existing: [],
    currentFile: undefined,
    uploadedFile: {
      id: 'new-1',
      name: 'dummy.txt',
      mimeType: 'text/plain',
      size: '99',
      webViewLink: '',
      webContentLink: ''
    },
    cleanupShouldFail: true
  });

  await run(harness.deps);

  assert.equal(harness.getUploadCount(), 1);
  assert.equal(harness.failedMessages.length, 1);
  assert.match(harness.failedMessages[0], /cleanup failed/);
  assert.equal(harness.warnings.length, 1);
  assert.match(harness.warnings[0], /cleanup failed/);
});
