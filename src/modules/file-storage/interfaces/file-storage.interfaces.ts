/**
 * File Storage Interfaces
 * Story 16.1: MinIO S3 Storage Setup (AC10)
 *
 * TypeScript interfaces for the FileStorageService.
 * Designed to be compatible with any S3-compatible provider:
 * - MinIO (local development and self-hosted production)
 * - AWS S3 (cloud production)
 * - DigitalOcean Spaces (cloud production)
 * - Backblaze B2 (cloud production)
 */

export interface FileInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  metadata?: Record<string, string>;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface ListOptions {
  prefix?: string;
  recursive?: boolean;
  maxKeys?: number;
}

export interface FileStorageConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  buckets: {
    uploads: string;
    cliSessions: string;
    exports: string;
    backups: string;
  };
  maxFileSizeMB: number;
}

export interface ObjectMetadata {
  size: number;
  contentType: string;
  lastModified: Date;
  metadata: Record<string, string>;
}
