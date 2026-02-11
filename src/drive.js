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
  updateFile,
  uploadFile,
  sharedListParams
};