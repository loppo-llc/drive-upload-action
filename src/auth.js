const fs = require('node:fs');
const { google } = require('googleapis');

function resolveCredentialsFile(credentialsFile) {
  if (credentialsFile) {
    assertCredentialsFile(credentialsFile, 'credentials-file');
    return credentialsFile;
  }

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    assertCredentialsFile(envPath, 'GOOGLE_APPLICATION_CREDENTIALS');
    return envPath;
  }

  throw new Error(
    'No credentials found. Provide one of:\n' +
      "  - 'credentials-file' input (recommended)\n" +
      '  - GOOGLE_APPLICATION_CREDENTIALS environment variable\n' +
      'Tip: use google-github-actions/auth before this action for Workload Identity Federation.'
  );
}

function assertCredentialsFile(filePath, label) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Credentials file specified by ${label} does not exist`);
    }
    throw new Error(`Credentials file specified by ${label} is not accessible`);
  }
  if (!stat.isFile()) {
    throw new Error(`Credentials path specified by ${label} is not a file`);
  }
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    throw new Error(`Credentials file specified by ${label} is not readable`);
  }
}

function createAuth(credentialsFile) {
  return new google.auth.GoogleAuth({
    keyFilename: credentialsFile,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
}

module.exports = { resolveCredentialsFile, createAuth };
