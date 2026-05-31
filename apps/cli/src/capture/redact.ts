import path from 'path';

// Load central secret redactor CommonJS module relatively
const redactorPath = path.resolve(__dirname, '../../../../scripts/lib/secret-redactor');
const secretRedactor = require(redactorPath);

/**
 * Sanitizes any text string by replacing matches of sensitive patterns with [REDACTED].
 */
export function redactText(text: string): string {
  return secretRedactor.redactSecrets(text);
}

