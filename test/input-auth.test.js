const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizeFolderPath, getBooleanInput, getNumberInput } = require('../src/input');
const { resolveCredentialsFile, createAuth } = require('../src/auth');

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

function withEnv(key, value, fn) {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
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

// --- resolveCredentialsFile tests ---

test('resolveCredentialsFile returns credentialsFile when provided and file exists', () => {
  const tmpFile = path.join(os.tmpdir(), `creds-test-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, '{}');
  try {
    withEnv('GOOGLE_APPLICATION_CREDENTIALS', undefined, () => {
      const result = resolveCredentialsFile(tmpFile);
      assert.equal(result, tmpFile);
    });
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test('resolveCredentialsFile prefers credentialsFile over env var', () => {
  const tmpFile1 = path.join(os.tmpdir(), `creds-test1-${Date.now()}.json`);
  const tmpFile2 = path.join(os.tmpdir(), `creds-test2-${Date.now()}.json`);
  fs.writeFileSync(tmpFile1, '{}');
  fs.writeFileSync(tmpFile2, '{}');
  try {
    withEnv('GOOGLE_APPLICATION_CREDENTIALS', tmpFile2, () => {
      const result = resolveCredentialsFile(tmpFile1);
      assert.equal(result, tmpFile1);
    });
  } finally {
    fs.unlinkSync(tmpFile1);
    fs.unlinkSync(tmpFile2);
  }
});

test('resolveCredentialsFile falls back to GOOGLE_APPLICATION_CREDENTIALS', () => {
  const tmpFile = path.join(os.tmpdir(), `creds-env-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, '{}');
  try {
    withEnv('GOOGLE_APPLICATION_CREDENTIALS', tmpFile, () => {
      const result = resolveCredentialsFile(undefined);
      assert.equal(result, tmpFile);
    });
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test('resolveCredentialsFile throws when credentialsFile does not exist', () => {
  withEnv('GOOGLE_APPLICATION_CREDENTIALS', undefined, () => {
    assert.throws(
      () => resolveCredentialsFile('/nonexistent/path/creds.json'),
      /credentials-file does not exist/i
    );
  });
});

test('resolveCredentialsFile throws when GOOGLE_APPLICATION_CREDENTIALS file does not exist', () => {
  withEnv('GOOGLE_APPLICATION_CREDENTIALS', '/nonexistent/path/creds.json', () => {
    assert.throws(
      () => resolveCredentialsFile(undefined),
      /GOOGLE_APPLICATION_CREDENTIALS does not exist/i
    );
  });
});

test('resolveCredentialsFile throws when path is a directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-dir-'));
  try {
    withEnv('GOOGLE_APPLICATION_CREDENTIALS', undefined, () => {
      assert.throws(
        () => resolveCredentialsFile(tmpDir),
        /credentials-file is not a file/i
      );
    });
  } finally {
    fs.rmdirSync(tmpDir);
  }
});

test('resolveCredentialsFile throws when no credentials at all', () => {
  withEnv('GOOGLE_APPLICATION_CREDENTIALS', undefined, () => {
    assert.throws(
      () => resolveCredentialsFile(undefined),
      /No credentials found/
    );
  });
});

test('resolveCredentialsFile error message includes guidance', () => {
  withEnv('GOOGLE_APPLICATION_CREDENTIALS', undefined, () => {
    assert.throws(
      () => resolveCredentialsFile(undefined),
      /google-github-actions\/auth/
    );
  });
});

// --- createAuth tests ---

test('createAuth returns a GoogleAuth instance', () => {
  const tmpFile = path.join(os.tmpdir(), `creds-auth-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({ type: 'service_account', client_email: 'a@b.com', private_key: 'k' }));
  try {
    const auth = createAuth(tmpFile);
    assert.ok(auth);
    assert.equal(typeof auth.getClient, 'function');
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

// --- getInputs credential-file integration ---

test('getInputs includes credentialsFile', () => {
  const { getInputs } = require('../src/input');

  const originalCf = process.env['INPUT_CREDENTIALS-FILE'];
  const originalSource = process.env['INPUT_SOURCE'];

  process.env['INPUT_CREDENTIALS-FILE'] = '/tmp/creds.json';
  process.env['INPUT_SOURCE'] = __filename;

  try {
    const inputs = getInputs();
    assert.equal(inputs.credentialsFile, '/tmp/creds.json');
  } finally {
    if (originalCf === undefined) {
      delete process.env['INPUT_CREDENTIALS-FILE'];
    } else {
      process.env['INPUT_CREDENTIALS-FILE'] = originalCf;
    }
    if (originalSource === undefined) {
      delete process.env['INPUT_SOURCE'];
    } else {
      process.env['INPUT_SOURCE'] = originalSource;
    }
  }
});

test('getInput handles kebab-case input names correctly', () => {
  const { getInput } = require('../src/io');

  const originalEnv = process.env['INPUT_CREDENTIALS-FILE'];
  process.env['INPUT_CREDENTIALS-FILE'] = 'test-value';

  try {
    const value = getInput('credentials-file');
    assert.equal(value, 'test-value');
  } finally {
    if (originalEnv === undefined) {
      delete process.env['INPUT_CREDENTIALS-FILE'];
    } else {
      process.env['INPUT_CREDENTIALS-FILE'] = originalEnv;
    }
  }
});
