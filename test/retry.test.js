const test = require('node:test');
const assert = require('node:assert/strict');

const { isRetriableError, withRetry } = require('../src/retry');

test('isRetriableError returns true for 503', () => {
  assert.equal(isRetriableError({ code: 503 }), true);
});

test('isRetriableError returns false for 400', () => {
  assert.equal(isRetriableError({ code: 400 }), false);
});

test('withRetry retries transient failures then succeeds', async () => {
  let calls = 0;

  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error('temporary');
        error.code = 503;
        throw error;
      }
      return 'ok';
    },
    {
      maxRetries: 4,
      initialDelayMs: 0,
      randomFn: () => 0,
      onRetry: () => {}
    }
  );

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('withRetry throws immediately for non-retriable error', async () => {
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          const error = new Error('bad request');
          error.code = 400;
          throw error;
        },
        {
          maxRetries: 5,
          initialDelayMs: 0,
          randomFn: () => 0,
          onRetry: () => {}
        }
      ),
    /bad request/
  );
});