const fs = require('node:fs');
const { google } = require('googleapis');

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sharedListParams(driveId) {
  const params = {
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  };

  if (driveId) {
    params.corpora = 'drive';
    params.driveId = driveId;
  }

  return params;
}

function createDriveClient(auth, requestTimeoutMs) {
  return google.drive({
    version: 'v3',
    auth,
    timeout: requestTimeoutMs
  });
}

async function listFilesByName({ drive, parentId, fileName, driveId, folderOnly = false }) {
  const escapedName = escapeDriveQueryValue(fileName);
  const escapedParent = escapeDriveQueryValue(parentId);

  const qParts = [
    `name = '${escapedName}'`,
    `'${escapedParent}' in parents`,
    'trashed = false'
  ];

  if (folderOnly) {
    qParts.push("mimeType = 'application/vnd.google-apps.folder'");
  }

  const query = qParts.join(' and ');
  const allFiles = [];
  let pageToken;

  do {
    const params = {
      q: query,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      ...sharedListParams(driveId)
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const response = await drive.files.list(params);
    const files = response.data.files || [];
    allFiles.push(...files);
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

async function createFolder({ drive, parentId, folderName }) {
  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id,name,mimeType',
    supportsAllDrives: true
  });

  return response.data;
}

async function ensureFolderPath({ drive, rootParentId, folderPathSegments, driveId, withRetry }) {
  let currentParentId = rootParentId;

  for (const segment of folderPathSegments) {
    const folders = await withRetry(() =>
      listFilesByName({
        drive,
        parentId: currentParentId,
        fileName: segment,
        driveId,
        folderOnly: true
      })
    );

    if (folders.length > 0) {
      currentParentId = folders[0].id;
      continue;
    }

    const created = await withRetry(() =>
      createFolder({
        drive,
        parentId: currentParentId,
        folderName: segment
      })
    );

    currentParentId = created.id;
  }

  return currentParentId;
}

async function deleteFile({ drive, fileId }) {
  await drive.files.delete({
    fileId,
    supportsAllDrives: true
  });
}

async function getFileById({ drive, fileId }) {
  const response = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,size,webViewLink,webContentLink',
    supportsAllDrives: true
  });
  return response.data;
}

async function validateParentFolder({ drive, parentId }) {
  if (!parentId || typeof parentId !== 'string') {
    throw new Error(`parent-folder-id is required (use 'root' for root folder)`);
  }

  const normalized = parentId.trim();
  if (normalized === '') {
    throw new Error(`parent-folder-id is required (use 'root' for root folder)`);
  }

  if (normalized === 'root') {
    return { id: 'root', name: 'root', accessible: true };
  }

  try {
    const response = await drive.files.get({
      fileId: normalized,
      fields: 'id,name,mimeType,trashed,capabilities(canAddChildren)',
      supportsAllDrives: true
    });

    const file = response.data;

    if (file.trashed) {
      throw new Error(
        `parent-folder-id '${normalized}' is in trash. restore it or use a different folder.`
      );
    }

    if (file.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error(
        `parent-folder-id '${normalized}' is not a folder (mimeType: ${file.mimeType})`
      );
    }

    if (file.capabilities && file.capabilities.canAddChildren === false) {
      throw new Error(
        `cannot add files to folder '${normalized}'. ensure the service account has write access.`
      );
    }

    return { id: file.id, name: file.name, accessible: true };
  } catch (error) {
    if (error.message && error.message.startsWith('parent-folder-id')) {
      throw error;
    }

    const status = error?.code || error?.response?.status;

    if (status === 400) {
      throw new Error(
        `invalid parent-folder-id format '${normalized}'. ensure the folder ID is correct.`
      );
    }

    if (status === 404) {
      throw new Error(
        `parent-folder-id '${normalized}' not found or not accessible. ensure:\n` +
        `  1. the folder ID is correct\n` +
        `  2. the service account has been granted access to this folder\n` +
        `  3. the folder is not in a shared drive without proper configuration`
      );
    }

    if (status === 403) {
      throw new Error(
        `permission denied for parent-folder-id '${normalized}'. ` +
        `ensure the service account has been granted access to this folder.`
      );
    }

    throw new Error(
      `failed to validate parent-folder-id '${normalized}': ${error.message || 'unknown error'}`
    );
  }
}

async function updateFile({
  drive,
  fileId,
  uploadPath,
  uploadName,
  mimeType
}) {
  const response = await drive.files.update({
    fileId,
    requestBody: {
      name: uploadName
    },
    media: {
      mimeType,
      body: fs.createReadStream(uploadPath)
    },
    fields: 'id,name,mimeType,size,webViewLink,webContentLink',
    supportsAllDrives: true
  });

  return response.data;
}

async function uploadFile({
  drive,
  uploadPath,
  uploadName,
  mimeType,
  parentId
}) {
  const response = await drive.files.create({
    requestBody: {
      name: uploadName,
      parents: [parentId]
    },
    media: {
      mimeType,
      body: fs.createReadStream(uploadPath)
    },
    fields: 'id,name,mimeType,size,webViewLink,webContentLink',
    supportsAllDrives: true
  });

  return response.data;
}

module.exports = {
  createDriveClient,
  listFilesByName,
  ensureFolderPath,
  deleteFile,
  getFileById,
  validateParentFolder,
  updateFile,
  uploadFile,
  sharedListParams
};