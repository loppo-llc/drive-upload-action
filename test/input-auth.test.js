const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeFolderPath, getBooleanInput, getNumberInput } = require('../src/input');
const { parseServiceAccountJson } = require('../src/auth');

function toInputEnvKey(name) {
  return `INPUT_${name.replace(/ /g, '_').replace(/-/g, '_').toUpperCase()}`;
}

function withMockedInputEnv(values, fn) {
  const originalEnv = {};
  const keys = Object.keys(values);

  for (const key of keys) {
    const envKey = toInputEnvKey(key);
    originalEnv[envKey] = process.env[envKey];
    process.env[envKey] = values[key];
  }

  try {
    fn();
  } finally {
    for (const key of keys) {
      const envKey = toInputEnvKey(key);
      if (originalEnv[envKey] === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = originalEnv[envKey];
      }
    }
  }
}

test('normalizeFolderPath handles slash and backslash', () => {
  assert.deepEqual(normalizeFolderPath('a/b\\c'), ['a', 'b', 'c']);
});

test('getBooleanInput parses yes/no values', () => {
  withMockedInputEnv({ sample: 'yes' }, () => {
    assert.equal(getBooleanInput('sample', false), true);
  });

  withMockedInputEnv({ sample: '0' }, () => {
    assert.equal(getBooleanInput('sample', true), false);
  });
});

test('getNumberInput validates integer', () => {
  withMockedInputEnv({ retries: '5' }, () => {
    assert.equal(getNumberInput('retries', 1, { min: 0 }), 5);
  });

  withMockedInputEnv({ retries: 'x' }, () => {
    assert.throws(() => getNumberInput('retries', 1, { min: 0 }), /must be an integer/);
  });
});

test('getNumberInput handles edge cases', () => {
  withMockedInputEnv({ retries: '-1' }, () => {
    assert.throws(() => getNumberInput('retries', 1, { min: 0 }), /must be >= 0/);
  });

  withMockedInputEnv({ retries: '3.14' }, () => {
    assert.throws(() => getNumberInput('retries', 1, { min: 0 }), /must be an integer/);
  });

  withMockedInputEnv({ retries: '0' }, () => {
    assert.equal(getNumberInput('retries', 1, { min: 0 }), 0);
  });

  // Test empty input returns default
  withMockedInputEnv({ retries: '' }, () => {
    assert.equal(getNumberInput('retries', 999, { min: 0 }), 999);
  });
});

test('getBooleanInput handles edge cases', () => {
  withMockedInputEnv({ flag: 'TRUE' }, () => {
    assert.equal(getBooleanInput('flag', false), true);
  });

  withMockedInputEnv({ flag: 'FALSE' }, () => {
    assert.equal(getBooleanInput('flag', true), false);
  });

  withMockedInputEnv({ flag: 'maybe' }, () => {
    assert.throws(() => getBooleanInput('flag', true), /must be boolean-like/);
  });

  // Test empty input returns default
  withMockedInputEnv({ flag: '' }, () => {
    assert.equal(getBooleanInput('flag', true), true);
  });
});

test('parseServiceAccountJson validates fields', () => {
  const creds = parseServiceAccountJson({
    serviceAccountJson: JSON.stringify({
      client_email: 'a@example.com',
      private_key: 'line1\\nline2'
    })
  });

  assert.equal(creds.client_email, 'a@example.com');
  assert.equal(creds.private_key.includes('\n'), true);
});

test('parseServiceAccountJson throws error when no credentials provided', () => {
  assert.throws(
    () => parseServiceAccountJson({}),
    /either 'service-account-json' or 'service-account-json-base64' input is required/
  );
});

test('parseServiceAccountJson throws error on invalid JSON', () => {
  assert.throws(
    () => parseServiceAccountJson({ serviceAccountJson: 'invalid-json' }),
    /failed to parse service account JSON/
  );
});

test('parseServiceAccountJson throws error on missing required fields', () => {
  assert.throws(
    () => parseServiceAccountJson({ serviceAccountJson: JSON.stringify({ type: 'service_account' }) }),
    /service account JSON must include 'client_email' and 'private_key'/
  );
});

test('parseServiceAccountJson handles base64 decoding failure', () => {
  assert.throws(
    () => parseServiceAccountJson({ serviceAccountJsonBase64: 'invalid-base64!!!' }),
    /failed to (decode base64 credentials|parse service account JSON)/
  );
});

test('parseServiceAccountJson successfully decodes base64', () => {
  const json = JSON.stringify({ client_email: 'test@example.com', private_key: 'key' });
  const base64 = Buffer.from(json).toString('base64');

  const creds = parseServiceAccountJson({ serviceAccountJsonBase64: base64 });
  assert.equal(creds.client_email, 'test@example.com');
});
