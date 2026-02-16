/**
 * Filename Sanitizer Utility
 * Story 16.2: File Upload/Download API (AC8)
 *
 * Sanitizes filenames for safe storage by removing path traversal
 * characters, null bytes, and other unsafe patterns.
 */

/**
 * Sanitize a filename for safe storage.
 * - Remove path separators (/ and \)
 * - Remove null bytes
 * - Replace sequences of dots with single dot (prevent hidden file creation)
 * - Trim whitespace
 * - Truncate to maxLength (default 255)
 * - If empty after sanitization, use 'unnamed-file'
 */
export function sanitizeFilename(filename: string, maxLength: number = 255): string {
  let sanitized = filename;

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove path separators (forward slash and backslash)
  sanitized = sanitized.replace(/[/\\]/g, '');

  // Collapse multiple consecutive dots to a single dot
  sanitized = sanitized.replace(/\.{2,}/g, '.');

  // Remove leading dots (prevent hidden files)
  sanitized = sanitized.replace(/^\.+/, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // If empty after sanitization, use fallback name
  if (!sanitized || sanitized === '.') {
    sanitized = 'unnamed-file';
  }

  return sanitized;
}
