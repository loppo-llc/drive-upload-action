const test = require('node:test');
const assert = require('node:assert/strict');

const { validateParentFolder } = require('../src/drive');

test('validateParentFolder accepts root', async () => {
  const drive = { files: {} };
  const result = await validateParentFolder({ drive, parentId: 'root' });

  assert.equal(result.id, 'root');
  assert.equal(result.name, 'root');
  assert.equal(result.accessible, true);
});

test('validateParentFolder trims whitespace from root', async () => {
  const drive = { files: {} };
  const result = await validateParentFolder({ drive, parentId: '  root  ' });

  assert.equal(result.id, 'root');
});

test('validateParentFolder throws on empty string', async () => {
  const drive = { files: {} };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: '' }),
    { message: /parent-folder-id is required/ }
  );
});

test('validateParentFolder throws on whitespace-only string', async () => {
  const drive = { files: {} };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: '   ' }),
    { message: /parent-folder-id is required/ }
  );
});

test('validateParentFolder throws on null', async () => {
  const drive = { files: {} };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: null }),
    { message: /parent-folder-id is required/ }
  );
});

test('validateParentFolder throws on undefined', async () => {
  const drive = { files: {} };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: undefined }),
    { message: /parent-folder-id is required/ }
  );
});

test('validateParentFolder accepts valid folder', async () => {
  const drive = {
    files: {
      get: async ({ fileId }) => {
        assert.equal(fileId, 'folder-123');
        return {
          data: {
            id: 'folder-123',
            name: 'My Folder',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
            capabilities: { canAddChildren: true }
          }
        };
      }
    }
  };

  const result = await validateParentFolder({ drive, parentId: 'folder-123' });

  assert.equal(result.id, 'folder-123');
  assert.equal(result.name, 'My Folder');
  assert.equal(result.accessible, true);
});

test('validateParentFolder trims whitespace from folder ID', async () => {
  const drive = {
    files: {
      get: async ({ fileId }) => {
        assert.equal(fileId, 'folder-123');
        return {
          data: {
            id: 'folder-123',
            name: 'My Folder',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
            capabilities: { canAddChildren: true }
          }
        };
      }
    }
  };

  const result = await validateParentFolder({ drive, parentId: '  folder-123  ' });

  assert.equal(result.id, 'folder-123');
});

test('validateParentFolder throws on trashed folder', async () => {
  const drive = {
    files: {
      get: async () => ({
        data: {
          id: 'folder-trashed',
          name: 'Trashed Folder',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: true
        }
      })
    }
  };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: 'folder-trashed' }),
    { message: /is in trash/ }
  );
});

test('validateParentFolder throws on non-folder mimeType', async () => {
  const drive = {
    files: {
      get: async () => ({
        data: {
          id: 'file-123',
          name: 'Document.pdf',
          mimeType: 'application/pdf',
          trashed: false
        }
      })
    }
  };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: 'file-123' }),
    { message: /is not a folder/ }
  );
});

test('validateParentFolder throws when canAddChildren is false', async () => {
  const drive = {
    files: {
      get: async () => ({
        data: {
          id: 'folder-readonly',
          name: 'Read Only Folder',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
          capabilities: { canAddChildren: false }
        }
      })
    }
  };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: 'folder-readonly' }),
    { message: /cannot add files to folder/ }
  );
});

test('validateParentFolder throws helpful message on 404', async () => {
  const drive = {
    files: {
      get: async () => {
        const error = new Error('not found');
        error.code = 404;
        throw error;
      }
    }
  };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: 'missing-folder' }),
    { message: /not found or not accessible/ }
  );
});

test('validateParentFolder throws helpful message on 403', async () => {
  const drive = {
    files: {
      get: async () => {
        const error = new Error('forbidden');
        error.code = 403;
        throw error;
      }
    }
  };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: 'forbidden-folder' }),
    { message: /permission denied/ }
  );
});

test('validateParentFolder throws helpful message on 400', async () => {
  const drive = {
    files: {
      get: async () => {
        const error = new Error('bad request');
        error.code = 400;
        throw error;
      }
    }
  };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: 'bad-id-format' }),
    { message: /invalid parent-folder-id format/ }
  );
});

test('validateParentFolder handles error with response.status (404)', async () => {
  const drive = {
    files: {
      get: async () => {
        const error = new Error('not found');
        error.response = { status: 404 };
        throw error;
      }
    }
  };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: 'missing-folder' }),
    { message: /not found or not accessible/ }
  );
});

test('validateParentFolder handles error with response.status (403)', async () => {
  const drive = {
    files: {
      get: async () => {
        const error = new Error('forbidden');
        error.response = { status: 403 };
        throw error;
      }
    }
  };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: 'forbidden-folder' }),
    { message: /permission denied/ }
  );
});

test('validateParentFolder wraps unknown errors', async () => {
  const drive = {
    files: {
      get: async () => {
        throw new Error('unexpected network error');
      }
    }
  };

  await assert.rejects(
    () => validateParentFolder({ drive, parentId: 'some-folder' }),
    { message: /failed to validate parent-folder-id/ }
  );
});

test('validateParentFolder requests correct fields', async () => {
  let capturedParams;
  const drive = {
    files: {
      get: async (params) => {
        capturedParams = params;
        return {
          data: {
            id: 'folder-123',
            name: 'Test',
            mimeType: 'application/vnd.google-apps.folder',
            trashed: false,
            capabilities: { canAddChildren: true }
          }
        };
      }
    }
  };

  await validateParentFolder({ drive, parentId: 'folder-123' });

  assert.equal(capturedParams.fileId, 'folder-123');
  assert.equal(capturedParams.fields, 'id,name,mimeType,trashed,capabilities(canAddChildren)');
  assert.equal(capturedParams.supportsAllDrives, true);
});

test('validateParentFolder accepts folder without capabilities field', async () => {
  const drive = {
    files: {
      get: async () => ({
        data: {
          id: 'folder-123',
          name: 'My Folder',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false
        }
      })
    }
  };

  const result = await validateParentFolder({ drive, parentId: 'folder-123' });

  assert.equal(result.id, 'folder-123');
  assert.equal(result.accessible, true);
});
