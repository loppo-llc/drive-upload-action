const test = require('node:test');
const assert = require('node:assert/strict');

const { ensureFolderPath } = require('../src/drive');

function createSharedDriveMock() {
  const folders = new Map();
  let counter = 1000;

  // Pre-seed some folders
  folders.set('shared-root::projects', { id: 'proj-1', name: 'projects', mimeType: 'application/vnd.google-apps.folder' });

  return {
    files: {
      list: async ({ q, driveId, corpora }) => {
        // Verify shared drive parameters are passed
        assert.equal(driveId, 'shared-123');
        assert.equal(corpora, 'drive');

        const nameMatch = q.match(/name = '([^']+)'/);
        const parentMatch = q.match(/'([^']+)' in parents/);

        const name = nameMatch ? nameMatch[1] : '';
        const parent = parentMatch ? parentMatch[1] : '';
        const key = `${parent}::${name}`;

        const existing = folders.get(key);
        const files = existing ? [existing] : [];
        return { data: { files } };
      },
      create: async ({ requestBody, supportsAllDrives }) => {
        assert.equal(supportsAllDrives, true);

        const id = `shared-folder-${counter}`;
        counter += 1;
        const data = {
          id,
          name: requestBody.name,
          mimeType: requestBody.mimeType
        };
        const key = `${requestBody.parents[0]}::${requestBody.name}`;
        folders.set(key, data);
        return { data };
      }
    }
  };
}

test('ensureFolderPath works with shared drive and nested folders', async () => {
  const drive = createSharedDriveMock();

  const folderId = await ensureFolderPath({
    drive,
    rootParentId: 'shared-root',
    folderPathSegments: ['projects', 'alpha', 'releases'],
    driveId: 'shared-123',
    withRetry: (fn) => fn()
  });

  // First folder (projects) exists, second (alpha) and third (releases) should be created
  assert.equal(folderId, 'shared-folder-1001');
});

test('ensureFolderPath handles empty folder path with shared drive', async () => {
  const drive = createSharedDriveMock();

  const folderId = await ensureFolderPath({
    drive,
    rootParentId: 'shared-root',
    folderPathSegments: [],
    driveId: 'shared-123',
    withRetry: (fn) => fn()
  });

  assert.equal(folderId, 'shared-root');
});

test('drive query escaping handles special characters', async () => {
  const drive = {
    files: {
      list: async ({ q }) => {
        // Test that single quotes in names and parent IDs are properly escaped
        assert.ok(q.includes("name = 'O\\'Brien\\'s folder'"));
        assert.ok(q.includes("'parent\\'s-id' in parents"));
        return { data: { files: [] } };
      },
      create: async ({ requestBody }) => ({
        data: { id: 'new-folder', name: requestBody.name, mimeType: requestBody.mimeType }
      })
    }
  };

  await ensureFolderPath({
    drive,
    rootParentId: "parent's-id",
    folderPathSegments: ["O'Brien's folder"],
    driveId: undefined,
    withRetry: (fn) => fn()
  });
});