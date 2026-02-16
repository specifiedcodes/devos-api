/**
 * MIME Validation Utility Tests
 * Story 16.1: MinIO S3 Storage Setup
 */

import { validateMimeType, validateFileSize, sanitizeObjectKey } from '../utils/mime-validation';
import { BUCKET_CONFIGS } from '../constants/buckets';

describe('MIME Validation Utilities', () => {
  describe('validateMimeType', () => {
    it('should accept allowed MIME types for uploads bucket', () => {
      for (const mimeType of BUCKET_CONFIGS['devos-uploads'].allowedMimeTypes) {
        expect(validateMimeType('devos-uploads', mimeType)).toBe(true);
      }
    });

    it('should reject disallowed MIME types', () => {
      expect(validateMimeType('devos-uploads', 'application/x-executable')).toBe(false);
      expect(validateMimeType('devos-uploads', 'application/x-shellscript')).toBe(false);
    });

    it('should enforce bucket-specific allowed types', () => {
      // CLI sessions only allow gzip and octet-stream
      expect(validateMimeType('devos-cli-sessions', 'image/png')).toBe(false);
      expect(validateMimeType('devos-cli-sessions', 'application/gzip')).toBe(true);
    });

    it('should return false for unknown bucket', () => {
      expect(validateMimeType('unknown-bucket' as any, 'image/png')).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    it('should accept files within limit', () => {
      // 50MB is within 100MB limit for uploads
      expect(validateFileSize('devos-uploads', 50 * 1024 * 1024)).toBe(true);
    });

    it('should reject files exceeding limit', () => {
      // 150MB exceeds 100MB limit for uploads
      expect(validateFileSize('devos-uploads', 150 * 1024 * 1024)).toBe(false);
    });

    it('should use correct limit per bucket', () => {
      // CLI sessions: 50MB limit
      expect(validateFileSize('devos-cli-sessions', 60 * 1024 * 1024)).toBe(false);

      // Backups: 5000MB (5GB) limit
      expect(validateFileSize('devos-backups', 4000 * 1024 * 1024)).toBe(true);
    });

    it('should accept files at exactly the limit', () => {
      expect(validateFileSize('devos-uploads', 100 * 1024 * 1024)).toBe(true);
    });

    it('should return false for unknown bucket', () => {
      expect(validateFileSize('unknown-bucket' as any, 1024)).toBe(false);
    });
  });

  describe('sanitizeObjectKey', () => {
    it('should remove path traversal sequences', () => {
      expect(sanitizeObjectKey('ws1/../../../etc/passwd')).toBe('ws1/etc/passwd');
    });

    it('should normalize slashes', () => {
      expect(sanitizeObjectKey('ws1\\proj1//file.png')).toBe('ws1/proj1/file.png');
    });

    it('should trim leading/trailing slashes', () => {
      expect(sanitizeObjectKey('/ws1/proj1/file.png/')).toBe('ws1/proj1/file.png');
    });

    it('should collapse multiple consecutive slashes', () => {
      expect(sanitizeObjectKey('ws1///proj1////file.png')).toBe('ws1/proj1/file.png');
    });

    it('should handle empty string', () => {
      expect(sanitizeObjectKey('')).toBe('');
    });

    it('should handle key with only path traversal', () => {
      expect(sanitizeObjectKey('../../..')).toBe('');
    });
  });
});
