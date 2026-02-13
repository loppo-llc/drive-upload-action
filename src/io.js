const fs = require('node:fs');
const crypto = require('node:crypto');

function toInputEnvKey(name) {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
}

function getInput(name, { required = false } = {}) {
  const value = process.env[toInputEnvKey(name)] || '';
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new Error(`input '${name}' is required`);
  }
  return trimmed;
}

function escapeCommandValue(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function info(message) {
  const sanitized = String(message).replace(/\r\n?|\n/g, ' ');
  process.stdout.write(`${sanitized}\n`);
}

function warning(message) {
  process.stderr.write(`::warning::${escapeCommandValue(message)}\n`);
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (outputFile) {
    const delimiter = `ghadelimiter_${crypto.randomUUID()}`;
    const content = `${name}<<${delimiter}\n${String(value)}\n${delimiter}\n`;
    fs.appendFileSync(outputFile, content, 'utf8');
    return;
  }

  process.stdout.write(
    `::set-output name=${escapeCommandValue(name)}::${escapeCommandValue(String(value))}\n`
  );
}

function setFailed(message) {
  process.stderr.write(`::error::${escapeCommandValue(message)}\n`);
  process.exitCode = 1;
}

module.exports = {
  getInput,
  escapeCommandValue,
  info,
  warning,
  setOutput,
  setFailed
};
