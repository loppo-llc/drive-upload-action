const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { escapeCommandValue, info, setOutput, warning, setFailed } = require('../src/io');

test('escapeCommandValue escapes %, \\r, \\n', () => {
  assert.equal(escapeCommandValue('100%\r\ndone'), '100%25%0D%0Adone');
});

test('escapeCommandValue passes through safe strings unchanged', () => {
  assert.equal(escapeCommandValue('hello world'), 'hello world');
});

test('setOutput writes heredoc-delimited value to GITHUB_OUTPUT file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'io-test-'));
  const outputFile = path.join(tempDir, 'output');
  fs.writeFileSync(outputFile, '', 'utf8');

  const original = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = outputFile;

  try {
    setOutput('file-id', 'abc-123');
    const content = fs.readFileSync(outputFile, 'utf8');
    assert.match(content, /^file-id<<ghadelimiter_/);
    assert.ok(content.includes('abc-123'));
  } finally {
    process.env.GITHUB_OUTPUT = original;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('setOutput handles value containing newlines safely', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'io-test-'));
  const outputFile = path.join(tempDir, 'output');
  fs.writeFileSync(outputFile, '', 'utf8');

  const original = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = outputFile;

  try {
    setOutput('msg', 'line1\nline2');
    const content = fs.readFileSync(outputFile, 'utf8');
    assert.ok(content.includes('line1\nline2'));
    assert.match(content, /^msg<<ghadelimiter_/);
  } finally {
    process.env.GITHUB_OUTPUT = original;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('info sanitizes newlines to prevent command injection', () => {
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (data) => {
    chunks.push(data);
    return true;
  };

  try {
    info('file uploaded\n::error::injected');
    assert.equal(chunks[0], 'file uploaded ::error::injected\n');
  } finally {
    process.stdout.write = originalWrite;
  }
});

test('warning escapes special characters in message', () => {
  const chunks = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = (data) => {
    chunks.push(data);
    return true;
  };

  try {
    warning('bad\nmessage%here');
    assert.equal(chunks[0], '::warning::bad%0Amessage%25here\n');
  } finally {
    process.stderr.write = originalWrite;
  }
});

test('setFailed escapes special characters in message', () => {
  const chunks = [];
  const originalWrite = process.stderr.write;
  const originalExitCode = process.exitCode;
  process.stderr.write = (data) => {
    chunks.push(data);
    return true;
  };

  try {
    setFailed('fail\r\ninjection');
    assert.equal(chunks[0], '::error::fail%0D%0Ainjection\n');
    assert.equal(process.exitCode, 1);
  } finally {
    process.stderr.write = originalWrite;
    process.exitCode = originalExitCode;
  }
});

test('setOutput falls back to legacy format when GITHUB_OUTPUT not set', () => {
  const chunks = [];
  const originalWrite = process.stdout.write;
  const originalEnv = process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_OUTPUT;

  process.stdout.write = (data) => {
    chunks.push(data);
    return true;
  };

  try {
    setOutput('legacy-key', 'value\nwith\nlines');
    assert.equal(chunks[0], '::set-output name=legacy-key::value%0Awith%0Alines\n');
  } finally {
    process.stdout.write = originalWrite;
    if (originalEnv !== undefined) {
      process.env.GITHUB_OUTPUT = originalEnv;
    }
  }
});

test('escapeCommandValue handles Unicode and special characters', () => {
  assert.equal(escapeCommandValue('Hello 🌍\nWorld%Done\r'), 'Hello 🌍%0AWorld%25Done%0D');
  assert.equal(escapeCommandValue('測試\n中文'), '測試%0A中文');
});

test('info handles Unicode characters safely', () => {
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (data) => {
    chunks.push(data);
    return true;
  };

  try {
    info('ファイル名.zip\nアップロード完了');
    assert.equal(chunks[0], 'ファイル名.zip アップロード完了\n');
  } finally {
    process.stdout.write = originalWrite;
  }
});
