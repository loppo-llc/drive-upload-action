const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const archiver = require('archiver');
const mime = require('mime-types');

async function ensurePathExists(sourcePath) {
  let stat;
  try {
    stat = await fsp.stat(sourcePath);
  } catch {
    throw new Error(`source path does not exist: ${sourcePath}`);
  }

  return stat;
}

function randomZipPath() {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return path.join(os.tmpdir(), `drive-upload-${suffix}.zip`);
}

async function zipDirectory(sourceDir, outputPath) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('warning', (error) => {
      if (error.code === 'ENOENT') {
        return;
      }
      reject(error);
    });
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize().catch(reject);
  });
}

async function prepareUploadSource({ sourcePath, desiredName, archiveFolder }) {
  const stat = await ensurePathExists(sourcePath);

  if (stat.isDirectory()) {
    if (!archiveFolder) {
      throw new Error('source is a directory; set archive-folder=true to upload it as a zip');
    }

    const outputZipPath = randomZipPath();
    await zipDirectory(sourcePath, outputZipPath);
    const zipStat = await fsp.stat(outputZipPath);

    return {
      uploadPath: outputZipPath,
      uploadName: desiredName || `${path.basename(sourcePath)}.zip`,
      mimeType: 'application/zip',
      sizeBytes: Number(zipStat.size),
      cleanup: async () => {
        await fsp.rm(outputZipPath, { force: true });
      }
    };
  }

  if (!stat.isFile()) {
    throw new Error(`source path must be a file or directory: ${sourcePath}`);
  }

  return {
    uploadPath: sourcePath,
    uploadName: desiredName || path.basename(sourcePath),
    mimeType: mime.lookup(sourcePath) || 'application/octet-stream',
    sizeBytes: Number(stat.size),
    cleanup: async () => {}
  };
}

module.exports = {
  ensurePathExists,
  zipDirectory,
  prepareUploadSource
};
