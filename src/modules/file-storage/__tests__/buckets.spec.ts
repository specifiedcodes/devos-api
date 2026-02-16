/**
 * Bucket Constants Tests
 * Story 16.1: MinIO S3 Storage Setup
 */

import { STORAGE_BUCKETS, BUCKET_CONFIGS, StorageBucket } from '../constants/buckets';

describe('Bucket Constants', () => {
  describe('STORAGE_BUCKETS', () => {
    it('should contain all 4 required bucket names', () => {
      expect(STORAGE_BUCKETS.UPLOADS).toBe('devos-uploads');
      expect(STORAGE_BUCKETS.CLI_SESSIONS).toBe('devos-cli-sessions');
      expect(STORAGE_BUCKETS.EXPORTS).toBe('devos-exports');
      expect(STORAGE_BUCKETS.BACKUPS).toBe('devos-backups');
    });

    it('should have exactly 4 buckets', () => {
      expect(Object.keys(STORAGE_BUCKETS)).toHaveLength(4);
    });
  });

  describe('BUCKET_CONFIGS', () => {
    it('should have configuration for every bucket', () => {
      for (const bucketName of Object.values(STORAGE_BUCKETS)) {
        expect(BUCKET_CONFIGS[bucketName as StorageBucket]).toBeDefined();
      }
    });

    it('should have required fields for all bucket configs', () => {
      for (const config of Object.values(BUCKET_CONFIGS)) {
        expect(config.name).toBeDefined();
        expect(typeof config.name).toBe('string');
        expect(config.description).toBeDefined();
        expect(typeof config.description).toBe('string');
        expect(config.maxObjectSizeMB).toBeDefined();
        expect(config.maxObjectSizeMB).toBeGreaterThan(0);
        expect(config.allowedMimeTypes).toBeDefined();
        expect(Array.isArray(config.allowedMimeTypes)).toBe(true);
        expect(config.allowedMimeTypes.length).toBeGreaterThan(0);
      }
    });

    it('should not allow executable MIME types in any bucket', () => {
      const dangerousMimeTypes = [
        'application/x-executable',
        'application/x-msdos-program',
        'application/x-shellscript',
      ];

      for (const config of Object.values(BUCKET_CONFIGS)) {
        for (const dangerous of dangerousMimeTypes) {
          expect(config.allowedMimeTypes).not.toContain(dangerous);
        }
      }
    });

    it('should have correct size limits per bucket', () => {
      expect(BUCKET_CONFIGS['devos-uploads'].maxObjectSizeMB).toBe(100);
      expect(BUCKET_CONFIGS['devos-cli-sessions'].maxObjectSizeMB).toBe(50);
      expect(BUCKET_CONFIGS['devos-exports'].maxObjectSizeMB).toBe(200);
      expect(BUCKET_CONFIGS['devos-backups'].maxObjectSizeMB).toBe(5000);
    });
  });
});
