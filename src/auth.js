const { google } = require('googleapis');

function parseServiceAccountJson({ serviceAccountJson, serviceAccountJsonBase64 }) {
  const raw = serviceAccountJson || decodeBase64(serviceAccountJsonBase64);

  if (!raw) {
    throw new Error("either 'service-account-json' or 'service-account-json-base64' input is required");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`failed to parse service account JSON: ${error.message}`);
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("service account JSON must include 'client_email' and 'private_key'");
  }

  return {
    ...parsed,
    private_key: String(parsed.private_key).replace(/\\n/g, '\n')
  };
}

function decodeBase64(value) {
  if (!value) {
    return undefined;
  }

  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch (error) {
    throw new Error(`failed to decode base64 credentials: ${error.message}`);
  }
}

function createAuthClient({ credentials, subject }) {
  const scopes = ['https://www.googleapis.com/auth/drive'];
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes,
    subject
  });
}

module.exports = {
  parseServiceAccountJson,
  createAuthClient,
  decodeBase64
};