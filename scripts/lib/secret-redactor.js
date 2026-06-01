/**
 * CentralContext Secret Redactor Firewall
 * scripts/lib/secret-redactor.js
 *
 * Responsibilities:
 *   - Detect and redact sensitive credentials from string logs and nested objects
 *   - Zero-dependency, pure CommonJS module easily imported across server and scripts
 */

const redactionRules = [
  {
    name: 'Founder Code',
    pattern: /FOUNDER_CODE_\d+/g,
    placeholder: '[REDACTED_FOUNDER_CODE]'
  },
  {
    name: 'OpenRouter Key',
    pattern: /\bsk-or-v1-[a-zA-Z0-9_-]+\b/g,
    placeholder: '[REDACTED_OPENROUTER_KEY]'
  },
  {
    name: 'OpenRouter Key Prefix',
    pattern: /sk-or-v1-(?:\*+|\.{3})?/g,
    placeholder: '[REDACTED_OPENROUTER_KEY]'
  },
  {
    name: 'Escaped OpenRouter Pattern',
    pattern: /\\*bsk-or-v1-[^\s"'`]+/g,
    placeholder: '[REDACTED_OPENROUTER_KEY]'
  },
  {
    name: 'OpenAI Key',
    pattern: /\bsk-[a-zA-Z0-9_-]{24,}\b/g,
    placeholder: '[REDACTED_OPENAI_KEY]'
  },
  {
    name: 'Gemini Key',
    pattern: /\bAIza[a-zA-Z0-9_-]{10,}\b/g,
    placeholder: '[REDACTED_GEMINI_KEY]'
  },
  {
    name: 'Gemini Key Prefix',
    pattern: /AIza(?:\*+|\.{3})?/g,
    placeholder: '[REDACTED_GEMINI_KEY]'
  },
  {
    name: 'Escaped Gemini Pattern',
    pattern: /\\*bAIza[^\s"'`]+/g,
    placeholder: '[REDACTED_GEMINI_KEY]'
  },
  {
    name: 'GitHub Token',
    pattern: /\b(ghp|github_pat)_[a-zA-Z0-9_-]+\b/g,
    placeholder: '[REDACTED_GITHUB_TOKEN]'
  },
  {
    name: 'GitHub Token Prefix',
    pattern: /(?:ghp|github_pat)_(?:\*+|\.{3})?/g,
    placeholder: '[REDACTED_GITHUB_TOKEN]'
  },
  {
    name: 'Escaped GitHub Token Pattern',
    pattern: /\\*b(?:ghp|github_pat)_[^\s"'`]+/g,
    placeholder: '[REDACTED_GITHUB_TOKEN]'
  },
  {
    name: 'Bearer Token',
    pattern: /\bBearer\s+[a-zA-Z0-9\-._~+/]+=*\b/gi,
    placeholder: 'Bearer [REDACTED]'
  },
  {
    name: 'JWT',
    pattern: /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
    placeholder: '[REDACTED_JWT]'
  },
  {
    name: 'Password Field',
    pattern: /((?:[\"']?[a-zA-Z0-9_-]*)?(?:password|passwd|pwd)[\"']?\s*[:=]\s*)([\"']?)(?!\[REDACTED_PASSWORD\])([^\s\"'\n&,;}]+)\2/gi,
    replaceFn: (match, p1, p2, p3) => `${p1}${p2}[REDACTED_PASSWORD]${p2}`
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----|-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/gi,
    placeholder: '[REDACTED_PRIVATE_KEY]'
  }
];

/**
 * Checks if a string contains any unredacted secrets.
 * @param {string} text - The input text to scan.
 * @returns {boolean} - True if at least one secret was detected.
 */
function containsSecrets(text) {
  if (!text || typeof text !== 'string') return false;
  for (const rule of redactionRules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitizes any text by replacing sensitive patterns with placeholders.
 * @param {string} text - The input text.
 * @returns {string} - Redacted clean text.
 */
function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  let redacted = text;
  for (const rule of redactionRules) {
    if (rule.replaceFn) {
      redacted = redacted.replace(rule.pattern, rule.replaceFn);
    } else {
      redacted = redacted.replace(rule.pattern, rule.placeholder);
    }
  }
  return redacted;
}

/**
 * Recursively scans and redacts all string values inside nested objects/arrays in-place.
 * @param {any} obj - The input object, array, or string.
 * @returns {any} - The sanitized object/array/string.
 */
function scanObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return redactSecrets(obj);
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = scanObject(obj[i]);
    }
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        obj[key] = scanObject(obj[key]);
      }
    }
  }
  return obj;
}

module.exports = {
  containsSecrets,
  redactSecrets,
  scanObject,
  redactionRules
};
