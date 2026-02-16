/**
 * Filename Sanitizer Tests
 * Story 16.2: File Upload/Download API (AC8)
 */

import { sanitizeFilename } from '../utils/filename-sanitizer';

describe('sanitizeFilename', () => {
  it('should pass through a normal filename unchanged', () => {
    expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
  });

  it('should pass through filenames with hyphens and underscores', () => {
    expect(sanitizeFilename('my-file_v2.txt')).toBe('my-file_v2.txt');
  });

  it('should remove forward slashes (path traversal)', () => {
    const result = sanitizeFilename('../../etc/passwd');
    expect(result).not.toContain('/');
    expect(result).not.toContain('..');
  });

  it('should remove backslashes', () => {
    const result = sanitizeFilename('folder\\file.txt');
    expect(result).not.toContain('\\');
    expect(result).toBe('folderfile.txt');
  });

  it('should remove null bytes', () => {
    expect(sanitizeFilename('file\0name.txt')).toBe('filename.txt');
  });

  it('should trim leading and trailing whitespace', () => {
    expect(sanitizeFilename('  file.txt  ')).toBe('file.txt');
  });

  it('should truncate filenames to 255 characters by default', () => {
    const longName = 'a'.repeat(300) + '.txt';
    const result = sanitizeFilename(longName);
    expect(result.length).toBe(255);
  });

  it('should truncate filenames to custom max length', () => {
    const longName = 'a'.repeat(50);
    const result = sanitizeFilename(longName, 20);
    expect(result.length).toBe(20);
  });

  it('should return "unnamed-file" for empty string', () => {
    expect(sanitizeFilename('')).toBe('unnamed-file');
  });

  it('should return "unnamed-file" for whitespace-only string', () => {
    expect(sanitizeFilename('   ')).toBe('unnamed-file');
  });

  it('should handle only dots by returning "unnamed-file"', () => {
    // After collapsing multiple dots and removing leading dots
    expect(sanitizeFilename('...')).toBe('unnamed-file');
  });

  it('should collapse multiple consecutive dots to a single dot', () => {
    expect(sanitizeFilename('file..name.txt')).toBe('file.name.txt');
  });

  it('should collapse triple dots to single dot', () => {
    expect(sanitizeFilename('file...name.txt')).toBe('file.name.txt');
  });

  it('should handle path traversal with forward slashes', () => {
    const result = sanitizeFilename('../../../etc/passwd');
    expect(result).not.toContain('/');
    // dots at start are removed, slashes are removed
    expect(result).toBe('etcpasswd');
  });

  it('should preserve unicode characters', () => {
    // Unicode filenames should be preserved (minus path separators)
    const result = sanitizeFilename('dokumentation.pdf');
    expect(result).toBe('dokumentation.pdf');
  });

  it('should handle single dot filenames', () => {
    // After removing leading dots, this becomes empty, so fallback
    expect(sanitizeFilename('.')).toBe('unnamed-file');
  });

  it('should handle filenames with spaces in the middle', () => {
    expect(sanitizeFilename('my file name.txt')).toBe('my file name.txt');
  });

  it('should remove leading dots to prevent hidden files', () => {
    expect(sanitizeFilename('.htaccess')).toBe('htaccess');
  });

  it('should handle complex path traversal attempts', () => {
    const result = sanitizeFilename('..\\..\\windows\\system32\\config');
    expect(result).not.toContain('\\');
    expect(result).not.toContain('..');
  });
});
