/**
 * MIME Type and File Validation Utilities
 * Story 16.1: MinIO S3 Storage Setup (AC9)
 *
 * Provides validation functions for MIME types, file sizes,
 * and object key sanitization.
 */

import {
  BUCKET_CONFIGS,
  StorageBucket,
} from '../constants/buckets';

/**
 * Check if the given MIME type is allowed for the specified bucket.
 */
export function validateMimeType(
  bucket: StorageBucket,
  mimeType: string,
): boolean {
  const config = BUCKET_CONFIGS[bucket];
  if (!config) {
    return false;
  }
  return config.allowedMimeTypes.includes(mimeType);
}

/**
 * Check if file size (in bytes) is within the bucket's max size.
 */
export function validateFileSize(
  bucket: StorageBucket,
  sizeBytes: number,
): boolean {
  const config = BUCKET_CONFIGS[bucket];
  if (!config) {
    return false;
  }
  const maxSizeBytes = config.maxObjectSizeMB * 1024 * 1024;
  return sizeBytes <= maxSizeBytes;
}

/**
 * Sanitize an object key to prevent path traversal and normalize slashes.
 * - Remove any '..' path segments (path traversal prevention)
 * - Replace backslashes with forward slashes
 * - Trim leading/trailing slashes
 * - Collapse multiple consecutive slashes
 */
export function sanitizeObjectKey(key: string): string {
  let sanitized = key;

  // Replace backslashes with forward slashes
  sanitized = sanitized.replace(/\\/g, '/');

  // Split into segments, remove '..' and '.' segments and empty segments
  const segments = sanitized.split('/').filter((segment) => segment !== '..' && segment !== '.' && segment !== '');

  // Rejoin and collapse multiple slashes
  sanitized = segments.join('/');
  sanitized = sanitized.replace(/\/+/g, '/');

  // Trim leading and trailing slashes
  sanitized = sanitized.replace(/^\/+/, '').replace(/\/+$/, '');

  return sanitized;
}
