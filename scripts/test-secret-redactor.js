const assert = require('assert');
const { redactSecrets, containsSecrets } = require('./lib/secret-redactor');

const cases = [
  {
    name: 'OpenRouter key',
    input: 'key=sk-or-v1-abcdefghijklmnopqrstuvwxyz_123456',
    expected: '[REDACTED_OPENROUTER_KEY]',
  },
  {
    name: 'Gemini key',
    input: 'AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMY',
    expected: '[REDACTED_GEMINI_KEY]',
  },
  {
    name: 'GitHub token',
    input: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
    expected: '[REDACTED_GITHUB_TOKEN]',
  },
  {
    name: 'Bearer token',
    input: 'Authorization: Bearer abc.def-ghi_jkl0123456789',
    expected: 'Bearer [REDACTED]',
  },
  {
    name: 'JWT',
    input: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature_123',
    expected: '[REDACTED_JWT]',
  },
  {
    name: 'password field',
    input: 'password=supersecret',
    expected: 'password=[REDACTED_PASSWORD]',
  },
  {
    name: 'founder code',
    input: 'FOUNDER_CODE_8827',
    expected: '[REDACTED_FOUNDER_CODE]',
  },
];

for (const testCase of cases) {
  assert.strictEqual(containsSecrets(testCase.input), true, `${testCase.name} should be detected`);
  const redacted = redactSecrets(testCase.input);
  assert(redacted.includes(testCase.expected), `${testCase.name} should redact to ${testCase.expected}`);
  assert.strictEqual(containsSecrets(redacted), false, `${testCase.name} should not remain detectable after redaction`);
}

console.log(`Secret redactor tests passed: ${cases.length}/${cases.length}`);
