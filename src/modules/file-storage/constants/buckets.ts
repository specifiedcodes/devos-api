/**
 * Bucket Constants and Configuration
 * Story 16.1: MinIO S3 Storage Setup (AC8)
 *
 * Defines bucket names, storage limits, and allowed MIME types
 * for each storage bucket in the DevOS platform.
 */

export const STORAGE_BUCKETS = {
  UPLOADS: 'devos-uploads',
  CLI_SESSIONS: 'devos-cli-sessions',
  EXPORTS: 'devos-exports',
  BACKUPS: 'devos-backups',
} as const;

export type StorageBucket =
  (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

export interface BucketConfig {
  name: string;
  description: string;
  maxObjectSizeMB: number;
  allowedMimeTypes: string[];
}

export const BUCKET_CONFIGS: Record<StorageBucket, BucketConfig> = {
  'devos-uploads': {
    name: 'devos-uploads',
    description: 'User file uploads (project assets, attachments)',
    maxObjectSizeMB: 100,
    allowedMimeTypes: [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/json',
      'application/xml',
      'application/zip',
      'application/gzip',
    ],
  },
  'devos-cli-sessions': {
    name: 'devos-cli-sessions',
    description: 'CLI session recording archives (gzip compressed)',
    maxObjectSizeMB: 50,
    allowedMimeTypes: ['application/gzip', 'application/octet-stream'],
  },
  'devos-exports': {
    name: 'devos-exports',
    description: 'Cost reports, audit log exports',
    maxObjectSizeMB: 200,
    allowedMimeTypes: [
      'text/csv',
      'application/json',
      'application/pdf',
      'application/zip',
    ],
  },
  'devos-backups': {
    name: 'devos-backups',
    description: 'Database backup archives',
    maxObjectSizeMB: 5000, // 5GB for database backups
    allowedMimeTypes: [
      'application/gzip',
      'application/octet-stream',
      'application/sql',
    ],
  },
};
