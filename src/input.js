const path = require('node:path');
const { getInput } = require('./io');

function getBooleanInput(name, defaultValue) {
  const raw = getInput(name);
  if (!raw) {
    return defaultValue;
  }

  const normalized = raw.toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  throw new Error(`input '${name}' must be boolean-like, received '${raw}'`);
}

function getNumberInput(name, defaultValue, { min = undefined } = {}) {
  const raw = getInput(name);
  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`input '${name}' must be an integer, received '${raw}'`);
  }

  if (min !== undefined && value < min) {
    throw new Error(`input '${name}' must be >= ${min}, received '${raw}'`);
  }

  return value;
}

function normalizeFolderPath(folderPath) {
  if (!folderPath) {
    return [];
  }

  return folderPath
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getConflictBehavior() {
  const raw = (getInput('conflict-behavior') || 'overwrite').toLowerCase();
  const allowed = ['overwrite', 'skip', 'error'];
  if (!allowed.includes(raw)) {
    throw new Error(`input 'conflict-behavior' must be one of ${allowed.join(', ')}, received '${raw}'`);
  }
  return raw;
}

function getInputs() {
  const sourceInput = getInput('source', { required: true });
  const resolvedSourcePath = path.resolve(process.cwd(), sourceInput);
  const folderPathInput = getInput('folder-path');

  return {
    sourceInput,
    resolvedSourcePath,
    name: getInput('name') || undefined,
    mimeType: getInput('mime-type') || undefined,
    parentFolderId: getInput('parent-folder-id') || 'root',
    folderPathInput,
    folderPathSegments: normalizeFolderPath(folderPathInput),
    driveId: getInput('drive-id') || undefined,
    archiveFolder: getBooleanInput('archive-folder', true),
    conflictBehavior: getConflictBehavior(),
    credentialsFile: getInput('credentials-file') || undefined,
    maxRetries: getNumberInput('max-retries', 5, { min: 0 }),
    initialRetryDelayMs: getNumberInput('initial-retry-delay-ms', 1000, { min: 0 }),
    requestTimeoutMs: getNumberInput('request-timeout-ms', 120000, { min: 1000 })
  };
}

module.exports = {
  getInputs,
  getBooleanInput,
  getNumberInput,
  normalizeFolderPath
};