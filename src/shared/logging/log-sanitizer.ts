/**
 * Log Sanitizer
 *
 * Redacts sensitive data (API keys, tokens) from logs and error messages
 * to comply with security requirements (NFR-S8: Keys never logged)
 */

/**
 * Sanitizes log data by redacting API keys and sensitive information
 * @param data - Data to sanitize (string, object, Error, etc.)
 * @returns Sanitized data with API keys redacted
 */
export function sanitizeLogData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle strings
  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  // Handle Error objects
  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitizeString(data.message),
      stack: data.stack ? sanitizeString(data.stack) : undefined,
      ...Object.keys(data).reduce((acc, key) => {
        if (key !== 'name' && key !== 'message' && key !== 'stack') {
          acc[key] = sanitizeLogData((data as any)[key]);
        }
        return acc;
      }, {} as any),
    };
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item));
  }

  // Handle objects
  if (typeof data === 'object') {
    const sanitized: any = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        sanitized[key] = sanitizeLogData(data[key]);
      }
    }
    return sanitized;
  }

  // Return primitives as-is
  return data;
}

/**
 * Sanitizes a string by redacting API keys
 * @param str - String to sanitize
 * @returns Sanitized string with API keys redacted
 */
function sanitizeString(str: string): string {
  if (!str || typeof str !== 'string') {
    return str;
  }

  let sanitized = str;

  // Redact Anthropic keys: sk-ant-api03-... or sk-ant-...
  // Must be done before generic sk- pattern
  sanitized = sanitized.replace(
    /sk-ant-[a-zA-Z0-9_-]+/g,
    'sk-ant-[REDACTED]',
  );

  // Redact OpenAI project keys: sk-proj-...
  sanitized = sanitized.replace(
    /sk-proj-[a-zA-Z0-9_-]+/g,
    'sk-proj-[REDACTED]',
  );

  // Redact generic sk- keys (legacy OpenAI, etc.)
  // Use negative lookbehind to avoid matching sk-ant- or sk-proj- which are already redacted
  // Match sk- but NOT sk-ant- or sk-proj-
  sanitized = sanitized.replace(
    /\bsk-(?!ant-|proj-|\[REDACTED\])[a-zA-Z0-9_-]+/g,
    'sk-[REDACTED]',
  );

  // Redact api_key= patterns
  sanitized = sanitized.replace(
    /api[_-]?key\s*[=:]\s*[^\s,})"']+/gi,
    (match) => {
      const prefix = match.split(/[=:]/)[0];
      return `${prefix}=[REDACTED]`;
    },
  );

  // Redact apiKey: "value" patterns in JSON-like structures
  sanitized = sanitized.replace(
    /"apiKey"\s*:\s*"[^"]+"/gi,
    '"apiKey": "[REDACTED]"',
  );

  return sanitized;
}

/**
 * Sanitizes metadata for audit logging
 * Removes sensitive fields and ensures only key IDs are logged
 * @param metadata - Metadata object or key ID
 * @returns Sanitized metadata safe for audit logs
 */
export function sanitizeForAudit(metadata: any): any {
  if (typeof metadata === 'string') {
    // If it's just a key ID, wrap in object
    return { keyId: metadata };
  }

  if (typeof metadata === 'object' && metadata !== null) {
    const sanitized: any = {};

    // List of sensitive fields that should never appear in audit logs
    const sensitiveFields = [
      'apiKey',
      'plaintextKey',
      'decryptedKey',
      'encrypted_key',
      'encryptedKey',
      'encryptionIV',
      'encryption_iv',
      'secret',
      'password',
      'token',
    ];

    for (const key in metadata) {
      if (metadata.hasOwnProperty(key)) {
        // Skip sensitive fields
        if (sensitiveFields.includes(key)) {
          continue;
        }

        // Sanitize string values to redact any embedded API key patterns
        const value = metadata[key];
        if (typeof value === 'string') {
          sanitized[key] = sanitizeLogData(value);
        } else {
          sanitized[key] = value;
        }
      }
    }

    return sanitized;
  }

  return metadata;
}
