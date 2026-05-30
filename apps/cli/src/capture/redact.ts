import path from 'path';
import dotenv from 'dotenv';

// Load .env from root
const rootDir = path.resolve(__dirname, '../../../../');
dotenv.config({ path: path.join(rootDir, '.env') });

const defaultPatterns: RegExp[] = [
  // OpenAI API Key
  /sk-[a-zA-Z0-9]{48}/gi,
  // Authorization Headers (Bearer tokens)
  /(Authorization\s*:\s*)(Bearer\s+)?[a-zA-Z0-9_\-\.]{32,}/gi,
  // General inline API Key assignments
  /(api[-_]?key|apikey|private[-_]key|secret)\s*[:=]\s*['"]?([a-zA-Z0-9_\-\.]{32,128})['"]?/gi,
  // Password assignments
  /(password|passwd|pass|database[-_]password)\s*[:=]\s*['"]?([a-zA-Z0-9_\-\.\@\!]{6,30})['"]?/gi
];

// Load user defined patterns from .env (comma-separated regexes or plain strings)
const userPatterns: RegExp[] = [];
const customPatternsEnv = process.env.REDACT_PATTERNS;

if (customPatternsEnv) {
  customPatternsEnv.split(',').forEach(pat => {
    const trimmed = pat.trim();
    if (trimmed) {
      try {
        // Compile regular expression
        userPatterns.push(new RegExp(trimmed, 'gi'));
      } catch (e) {
        console.warn(`[Warning] Failed to compile user redact pattern: "${trimmed}":`, e);
      }
    }
  });
}

const allPatterns = [...defaultPatterns, ...userPatterns];

/**
 * Sanitizes any text string by replacing matches of sensitive patterns with [REDACTED].
 */
export function redactText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  let redacted = text;
  allPatterns.forEach(pattern => {
    redacted = redacted.replace(pattern, (match) => {
      // Keep structural prefix for keywords if helpful, otherwise redact whole match
      if (match.toLowerCase().includes('password') || match.toLowerCase().includes('key') || match.toLowerCase().includes('authorization')) {
        // Keep the assignment part (e.g. "password = ") and replace only the value
        const parts = match.split(/[:=]/);
        if (parts.length > 1) {
          const prefix = parts[0] + match.includes('=') ? '=' : ':';
          return `${parts[0]}${match.includes('=') ? '=' : ':'} "[REDACTED]"`;
        }
      }
      return '[REDACTED]';
    });
  });
  
  return redacted;
}
