const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeFolderPath,
  normalizeParentFolderIds,
  getBooleanInput,
  getNumberInput
} = require('../src/input');
const { parseServiceAccountJson } = require('../src/auth');

function toInputEnvKey(name) {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
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

test('normalizeParentFolderIds defaults to root when empty', () => {
  assert.deepEqual(normalizeParentFolderIds(''), ['root']);
  assert.deepEqual(normalizeParentFolderIds(undefined), ['root']);
  assert.deepEqual(normalizeParentFolderIds('   '), ['root']);
});

test('normalizeParentFolderIds returns single id', () => {
  assert.deepEqual(normalizeParentFolderIds('folder-1'), ['folder-1']);
  assert.deepEqual(normalizeParentFolderIds('  folder-1  '), ['folder-1']);
});

test('normalizeParentFolderIds splits on comma', () => {
  assert.deepEqual(
    normalizeParentFolderIds('folder-1, folder-2,folder-3'),
    ['folder-1', 'folder-2', 'folder-3']
  );
});

test('normalizeParentFolderIds splits on newline', () => {
  assert.deepEqual(
    normalizeParentFolderIds('folder-1\nfolder-2\r\nfolder-3'),
    ['folder-1', 'folder-2', 'folder-3']
  );
});

test('normalizeParentFolderIds mixes separators and dedupes', () => {
  assert.deepEqual(
    normalizeParentFolderIds('folder-1\nfolder-2, folder-1, folder-3'),
    ['folder-1', 'folder-2', 'folder-3']
  );
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

// Test actual GitHub Actions environment variable behavior
test('getInput handles kebab-case input names correctly', () => {
  const { getInput } = require('../src/io');

  // GitHub Actions sets INPUT_SERVICE-ACCOUNT-JSON (with hyphens)
  const originalEnv = process.env['INPUT_SERVICE-ACCOUNT-JSON'];
  process.env['INPUT_SERVICE-ACCOUNT-JSON'] = 'test-value';

  try {
    const value = getInput('service-account-json');
    assert.equal(value, 'test-value');
  } finally {
    if (originalEnv === undefined) {
      delete process.env['INPUT_SERVICE-ACCOUNT-JSON'];
    } else {
      process.env['INPUT_SERVICE-ACCOUNT-JSON'] = originalEnv;
    }
  }
});

test('service-account-json input is properly handled by getInputs', () => {
  const { getInputs } = require('../src/input');

  const originalEnv = process.env['INPUT_SERVICE-ACCOUNT-JSON'];
  const originalEnvBase64 = process.env['INPUT_SERVICE-ACCOUNT-JSON-BASE64'];
  const originalSource = process.env['INPUT_SOURCE'];

  process.env['INPUT_SERVICE-ACCOUNT-JSON'] = '{"client_email":"test@example.com","private_key":"key"}';
  process.env['INPUT_SOURCE'] = __filename; // Use this test file as source

  try {
    const inputs = getInputs();
    assert.equal(inputs.serviceAccountJson, '{"client_email":"test@example.com","private_key":"key"}');
    assert.equal(inputs.serviceAccountJsonBase64, undefined);
  } finally {
    if (originalEnv === undefined) {
      delete process.env['INPUT_SERVICE-ACCOUNT-JSON'];
    } else {
      process.env['INPUT_SERVICE-ACCOUNT-JSON'] = originalEnv;
    }
    if (originalEnvBase64 === undefined) {
      delete process.env['INPUT_SERVICE-ACCOUNT-JSON-BASE64'];
    } else {
      process.env['INPUT_SERVICE-ACCOUNT-JSON-BASE64'] = originalEnvBase64;
    }
    if (originalSource === undefined) {
      delete process.env['INPUT_SOURCE'];
    } else {
      process.env['INPUT_SOURCE'] = originalSource;
    }
  }
});
