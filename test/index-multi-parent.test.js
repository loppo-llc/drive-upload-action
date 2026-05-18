const test = require('node:test');
const assert = require('node:assert/strict');

const { run } = require('../src/index');

function createHarness({
  parentFolderIds,
  existingByParent = {},
  uploadedById = {},
  updatedById = {},
  conflictBehavior = 'overwrite'
}) {
  const validatedParents = [];
  const listedParents = [];
  const uploadedParents = [];
  const updatedFileIds = [];
  const deletedIds = [];
  const outputs = new Map();
  const failedMessages = [];
  const infos = [];

  const deps = {
    io: {
      info: (message) => infos.push(message),
      warning: () => {},
      setFailed: (message) => failedMessages.push(message),
      setOutput: (name, value) => outputs.set(name, String(value))
    },
    getInputs: () => ({
      sourceInput: 'dummy.txt',
      resolvedSourcePath: '/tmp/dummy.txt',
      name: undefined,
      mimeType: undefined,
      parentFolderId: parentFolderIds[0],
      parentFolderIds,
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
      cleanup: async () => {}
    }),
    createDriveClient: () => ({ files: {} }),
    validateParentFolder: async ({ parentId }) => {
      validatedParents.push(parentId);
      return { id: parentId, name: parentId, accessible: true };
    },
    ensureFolderPath: async () => {
      throw new Error('ensureFolderPath should not be called in this test');
    },
    listFilesByName: async ({ parentId }) => {
      listedParents.push(parentId);
      return existingByParent[parentId] || [];
    },
    deleteFile: async ({ fileId }) => {
      deletedIds.push(fileId);
    },
    getFileById: async ({ fileId }) => ({
      id: fileId,
      name: 'dummy.txt',
      mimeType: 'text/plain',
      size: '21'
    }),
    updateFile: async ({ fileId }) => {
      updatedFileIds.push(fileId);
      return (
        updatedById[fileId] || {
          id: fileId,
          name: 'dummy.txt',
          mimeType: 'text/plain',
          size: '99'
        }
      );
    },
    uploadFile: async ({ parentId }) => {
      uploadedParents.push(parentId);
      return (
        uploadedById[parentId] || {
          id: `uploaded-${parentId}`,
          name: 'dummy.txt',
          mimeType: 'text/plain',
          size: '12'
        }
      );
    }
  };

  return {
    deps,
    validatedParents,
    listedParents,
    uploadedParents,
    updatedFileIds,
    deletedIds,
    outputs,
    failedMessages,
    infos
  };
}

test('run uploads to multiple parent folders', async () => {
  const harness = createHarness({
    parentFolderIds: ['folder-a', 'folder-b', 'folder-c']
  });

  await run(harness.deps);

  assert.equal(harness.failedMessages.length, 0);
  assert.deepEqual(harness.validatedParents, ['folder-a', 'folder-b', 'folder-c']);
  assert.deepEqual(harness.listedParents, ['folder-a', 'folder-b', 'folder-c']);
  assert.deepEqual(harness.uploadedParents, ['folder-a', 'folder-b', 'folder-c']);

  assert.equal(harness.outputs.get('file-id'), 'uploaded-folder-a');
  assert.equal(harness.outputs.get('file-ids'), 'uploaded-folder-a\nuploaded-folder-b\nuploaded-folder-c');
  assert.equal(
    harness.outputs.get('file-names'),
    'dummy.txt\ndummy.txt\ndummy.txt'
  );
  assert.equal(harness.outputs.get('size-bytes-list'), '12\n12\n12');
});

test('run mixes upload and update across destinations based on conflict-behavior=overwrite', async () => {
  const harness = createHarness({
    parentFolderIds: ['folder-a', 'folder-b'],
    existingByParent: {
      'folder-b': [{ id: 'existing-b' }]
    },
    updatedById: {
      'existing-b': {
        id: 'existing-b',
        name: 'dummy.txt',
        mimeType: 'text/plain',
        size: '99'
      }
    }
  });

  await run(harness.deps);

  assert.equal(harness.failedMessages.length, 0);
  assert.deepEqual(harness.uploadedParents, ['folder-a']);
  assert.deepEqual(harness.updatedFileIds, ['existing-b']);

  assert.equal(harness.outputs.get('file-id'), 'uploaded-folder-a');
  assert.equal(harness.outputs.get('file-ids'), 'uploaded-folder-a\nexisting-b');
});

test('run fails fast when any parent folder validation fails', async () => {
  const harness = createHarness({
    parentFolderIds: ['folder-a', 'folder-b']
  });

  let calls = 0;
  harness.deps.validateParentFolder = async ({ parentId }) => {
    calls += 1;
    if (parentId === 'folder-b') {
      throw new Error(`parent-folder-id '${parentId}' not found`);
    }
    return { id: parentId, name: parentId, accessible: true };
  };

  await run(harness.deps);

  assert.equal(calls, 2);
  assert.equal(harness.failedMessages.length, 1);
  assert.match(harness.failedMessages[0], /folder-b/);
  assert.deepEqual(harness.uploadedParents, []);
});

test('run with conflict-behavior=skip across multiple parents', async () => {
  const harness = createHarness({
    parentFolderIds: ['folder-a', 'folder-b'],
    conflictBehavior: 'skip',
    existingByParent: {
      'folder-a': [{ id: 'existing-a' }],
      'folder-b': [{ id: 'existing-b' }]
    }
  });

  await run(harness.deps);

  assert.equal(harness.failedMessages.length, 0);
  assert.deepEqual(harness.uploadedParents, []);
  assert.deepEqual(harness.updatedFileIds, []);

  assert.equal(harness.outputs.get('file-id'), 'existing-a');
  assert.equal(harness.outputs.get('file-ids'), 'existing-a\nexisting-b');
  assert.equal(harness.outputs.get('size-bytes-list'), '21\n21');
});

test('run with conflict-behavior=error fails before writing when any destination has conflict', async () => {
  const harness = createHarness({
    parentFolderIds: ['folder-a', 'folder-b'],
    conflictBehavior: 'error',
    existingByParent: {
      'folder-b': [{ id: 'existing-b' }]
    }
  });

  await run(harness.deps);

  assert.equal(harness.failedMessages.length, 1);
  assert.match(harness.failedMessages[0], /already exists/);
  assert.match(harness.failedMessages[0], /folder-b/);
  assert.deepEqual(harness.listedParents, ['folder-a', 'folder-b']);
  assert.deepEqual(harness.uploadedParents, []);
  assert.deepEqual(harness.updatedFileIds, []);
});

test('run uses ensureFolderPath under each parent when folder-path is set', async () => {
  const ensureCalls = [];
  const harness = createHarness({
    parentFolderIds: ['folder-a', 'folder-b']
  });

  harness.deps.getInputs = () => ({
    sourceInput: 'dummy.txt',
    resolvedSourcePath: '/tmp/dummy.txt',
    name: undefined,
    mimeType: undefined,
    parentFolderId: 'folder-a',
    parentFolderIds: ['folder-a', 'folder-b'],
    folderPathInput: 'release/nightly',
    folderPathSegments: ['release', 'nightly'],
    driveId: undefined,
    archiveFolder: true,
    conflictBehavior: 'overwrite',
    serviceAccountJson: '{"client_email":"a@example.com","private_key":"k"}',
    serviceAccountJsonBase64: undefined,
    subject: undefined,
    maxRetries: 0,
    initialRetryDelayMs: 0,
    requestTimeoutMs: 1000
  });

  harness.deps.ensureFolderPath = async ({ rootParentId, folderPathSegments }) => {
    ensureCalls.push({ rootParentId, folderPathSegments });
    return `${rootParentId}-leaf`;
  };

  await run(harness.deps);

  assert.equal(harness.failedMessages.length, 0);
  assert.deepEqual(ensureCalls, [
    { rootParentId: 'folder-a', folderPathSegments: ['release', 'nightly'] },
    { rootParentId: 'folder-b', folderPathSegments: ['release', 'nightly'] }
  ]);
  assert.deepEqual(harness.uploadedParents, ['folder-a-leaf', 'folder-b-leaf']);
});
