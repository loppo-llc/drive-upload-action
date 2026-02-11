const { warning } = require('./io');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusCode(error) {
  return error?.code || error?.response?.status || error?.status;
}

function isRetriableError(error) {
  const status = getStatusCode(error);
  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const message = String(error?.message || '').toLowerCase();
  return [
    'econnreset',
    'etimedout',
    'socket hang up',
    'network error',
    'rate limit',
    'temporarily unavailable'
  ].some((token) => message.includes(token));
}

async function withRetry(operation, options = {}) {
  const {
    maxRetries = 5,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    randomFn = Math.random,
    onRetry = (attempt, delayMs, error) => {
      warning(`retry ${attempt}: waiting ${delayMs}ms after error: ${error.message}`);
    }
  } = options;

  let attempt = 0;
  let delayMs = initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetriableError(error) || attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
      const jitter = Math.floor(randomFn() * 250);
      const waitMs = Math.min(delayMs + jitter, maxDelayMs);
      onRetry(attempt, waitMs, error);
      await sleep(waitMs);
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
}

module.exports = {
  isRetriableError,
  withRetry
};
