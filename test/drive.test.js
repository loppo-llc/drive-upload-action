const test = require('node:test');
const assert = require('node:assert/strict');

const { ensureFolderPath, listFilesByName } = require('../src/drive');

function createDriveMock() {
  const store = new Map();
  let counter = 1;

  return {
    files: {
      list: async ({ q }) => {
        const nameMatch = q.match(/name = '([^']+)'/);
        const parentMatch = q.match(/'([^']+)' in parents/);
        const folderOnly = q.includes("mimeType = 'application/vnd.google-apps.folder'");

        const name = nameMatch ? nameMatch[1].replace(/\\'/g, "'") : '';
        const parent = parentMatch ? parentMatch[1].replace(/\\'/g, "'") : '';
        const key = `${parent}::${name}`;

        const existing = store.get(key);
        const files = existing && folderOnly ? [existing] : [];
        return { data: { files } };
      },
      create: async ({ requestBody }) => {
        const id = `folder-${counter}`;
        counter += 1;
        const data = {
          id,
          name: requestBody.name,
          mimeType: requestBody.mimeType
        };
        const key = `${requestBody.parents[0]}::${requestBody.name}`;
        store.set(key, data);
        return { data };
      }
    }
  };
}

test('ensureFolderPath creates missing segments and returns last folder id', async () => {
  const drive = createDriveMock();

  const folderId = await ensureFolderPath({
    drive,
    rootParentId: 'root',
    folderPathSegments: ['release', 'nightly'],
    driveId: undefined,
    withRetry: (fn) => fn()
  });

  assert.equal(folderId, 'folder-2');
});

test('ensureFolderPath reuses existing folder segment', async () => {
  const drive = createDriveMock();

  const first = await ensureFolderPath({
    drive,
    rootParentId: 'root',
    folderPathSegments: ['release'],
    driveId: undefined,
    withRetry: (fn) => fn()
  });

  const second = await ensureFolderPath({
    drive,
    rootParentId: 'root',
    folderPathSegments: ['release'],
    driveId: undefined,
    withRetry: (fn) => fn()
  });

  assert.equal(first, second);
});

test('listFilesByName collects results across multiple pages', async () => {
  let callCount = 0;
  const drive = {
    files: {
      list: async (params) => {
        callCount += 1;
        if (callCount === 1) {
          return {
            data: {
              files: [{ id: 'f1', name: 'dup', mimeType: 'text/plain', modifiedTime: '2025-01-01' }],
              nextPageToken: 'page2'
            }
          };
        }
        assert.equal(params.pageToken, 'page2');
        return {
          data: {
            files: [{ id: 'f2', name: 'dup', mimeType: 'text/plain', modifiedTime: '2025-01-02' }]
          }
        };
      }
    }
  };

  const results = await listFilesByName({
    drive,
    parentId: 'root',
    fileName: 'dup',
    driveId: undefined,
    folderOnly: false
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].id, 'f1');
  assert.equal(results[1].id, 'f2');
  assert.equal(callCount, 2);
});