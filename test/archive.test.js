const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { prepareUploadSource } = require('../src/archive');

test('prepareUploadSource keeps file as-is', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-upload-test-'));
  const file = path.join(tempDir, 'a.txt');
  await fs.writeFile(file, 'hello', 'utf8');

  const prepared = await prepareUploadSource({
    sourcePath: file,
    desiredName: undefined,
    archiveFolder: true
  });

  assert.equal(prepared.uploadPath, file);
  assert.equal(prepared.uploadName, 'a.txt');
  assert.equal(prepared.mimeType, 'text/plain');
  await prepared.cleanup();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('prepareUploadSource zips directory', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-upload-test-'));
  const folder = path.join(tempDir, 'out');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'a.txt'), 'hello', 'utf8');

  const prepared = await prepareUploadSource({
    sourcePath: folder,
    desiredName: undefined,
    archiveFolder: true
  });

  assert.equal(prepared.uploadName, 'out.zip');
  const stat = await fs.stat(prepared.uploadPath);
  assert.equal(stat.isFile(), true);
  await prepared.cleanup();

  await assert.rejects(() => fs.stat(prepared.uploadPath));
  await fs.rm(tempDir, { recursive: true, force: true });
});