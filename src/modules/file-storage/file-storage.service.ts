/**
 * File Storage Service
 * Story 16.1: MinIO S3 Storage Setup (AC5)
 *
 * Core service for S3-compatible object storage operations.
 * Uses the MinIO client library which is compatible with:
 * - MinIO (local/self-hosted)
 * - AWS S3
 * - DigitalOcean Spaces
 * - Backblaze B2
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';
import { loadFileStorageConfig } from './file-storage.config';
import { FileStorageConfig, FileInfo, UploadOptions, ListOptions, ObjectMetadata } from './interfaces/file-storage.interfaces';
import { STORAGE_BUCKETS, StorageBucket } from './constants/buckets';

/** Maximum signed URL expiry: 7 days in seconds */
const MAX_SIGNED_URL_EXPIRY = 604800;

@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly logger = new Logger(FileStorageService.name);
  private client!: Minio.Client;
  private config!: FileStorageConfig;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialize MinIO client and ensure buckets exist on module startup.
   */
  async onModuleInit(): Promise<void> {
    this.config = loadFileStorageConfig(this.configService);

    this.client = new Minio.Client({
      endPoint: this.config.endpoint,
      port: this.config.port,
      useSSL: this.config.useSSL,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
    });

    this.logger.log(
      `Connecting to MinIO at ${this.config.endpoint}:${this.config.port} (SSL: ${this.config.useSSL})`,
    );

    await this.ensureBucketsExist();
    this.logger.log('FileStorageService initialized successfully');
  }

  /**
   * Create required buckets if they do not exist.
   */
  async ensureBucketsExist(): Promise<void> {
    const bucketNames = Object.values(STORAGE_BUCKETS);
    const errors: Array<{ bucket: string; error: Error }> = [];

    for (const bucketName of bucketNames) {
      try {
        const exists = await this.client.bucketExists(bucketName);
        if (!exists) {
          await this.client.makeBucket(bucketName);
          this.logger.log(`Created bucket: ${bucketName}`);
        } else {
          this.logger.debug(`Bucket already exists: ${bucketName}`);
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to ensure bucket ${bucketName}: ${error.message}`,
        );
        errors.push({ bucket: bucketName, error });
      }
    }

    // Throw after attempting all buckets so partial initialization is possible
    if (errors.length > 0) {
      const failedBuckets = errors.map((e) => e.bucket).join(', ');
      throw new Error(
        `Failed to initialize ${errors.length} bucket(s): ${failedBuckets}`,
      );
    }
  }

  /**
   * Upload an object to a bucket.
   *
   * @param bucket - Target bucket name (must be in STORAGE_BUCKETS)
   * @param key - Object key (path within bucket)
   * @param data - File content as Buffer or Readable stream
   * @param options - Upload options (contentType, metadata)
   * @returns The object key
   */
  async upload(
    bucket: string,
    key: string,
    data: Buffer | Readable,
    options?: UploadOptions,
  ): Promise<string> {
    this.validateBucketName(bucket);

    // Validate file size for Buffer inputs
    if (Buffer.isBuffer(data)) {
      const maxSizeBytes = this.config.maxFileSizeMB * 1024 * 1024;
      if (data.length > maxSizeBytes) {
        throw new BadRequestException(
          `File size ${data.length} exceeds maximum allowed size of ${this.config.maxFileSizeMB}MB`,
        );
      }
    }

    try {
      const metaData: Record<string, string> = {};
      if (options?.contentType) {
        metaData['Content-Type'] = options.contentType;
      }
      if (options?.metadata) {
        Object.assign(metaData, options.metadata);
      }

      const size = Buffer.isBuffer(data) ? data.length : undefined;

      await this.client.putObject(bucket, key, data, size, metaData);
      return key;
    } catch (error: any) {
      this.logger.error(
        `Failed to upload to ${bucket}/${key}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to upload file to storage',
      );
    }
  }

  /**
   * Download an object from a bucket.
   *
   * @param bucket - Source bucket name
   * @param key - Object key
   * @returns Buffer containing the object data
   */
  async download(bucket: string, key: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(bucket, key);
      return await this.streamToBuffer(stream);
    } catch (error: any) {
      if (
        error.code === 'NoSuchKey' ||
        error.code === 'NotFound' ||
        error.message?.includes('Not Found') ||
        error.message?.includes('does not exist')
      ) {
        throw new NotFoundException(
          `Object not found: ${bucket}/${key}`,
        );
      }
      this.logger.error(
        `Failed to download ${bucket}/${key}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to download file from storage',
      );
    }
  }

  /**
   * Generate a presigned URL for downloading an object.
   *
   * @param bucket - Bucket name
   * @param key - Object key
   * @param expiresInSeconds - URL expiry in seconds (default: 3600, max: 604800)
   * @returns Presigned URL string
   */
  async getSignedUrl(
    bucket: string,
    key: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    // Clamp to valid range: minimum 1 second, maximum 7 days
    const clampedExpiry = Math.min(Math.max(expiresInSeconds, 1), MAX_SIGNED_URL_EXPIRY);

    return this.client.presignedGetObject(bucket, key, clampedExpiry);
  }

  /**
   * Delete an object from a bucket. Idempotent - does not throw if object doesn't exist.
   *
   * @param bucket - Bucket name
   * @param key - Object key
   */
  async delete(bucket: string, key: string): Promise<void> {
    try {
      await this.client.removeObject(bucket, key);
    } catch (error: any) {
      // Idempotent delete - don't throw if object doesn't exist
      if (
        error.code === 'NoSuchKey' ||
        error.code === 'NotFound'
      ) {
        return;
      }
      this.logger.error(
        `Failed to delete ${bucket}/${key}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to delete file from storage',
      );
    }
  }

  /**
   * List objects in a bucket.
   *
   * @param bucket - Bucket name
   * @param options - List options (prefix, recursive, maxKeys)
   * @returns Array of FileInfo objects
   */
  async list(bucket: string, options?: ListOptions): Promise<FileInfo[]> {
    return new Promise((resolve, reject) => {
      const results: FileInfo[] = [];
      const stream = this.client.listObjectsV2(
        bucket,
        options?.prefix || '',
        options?.recursive ?? true,
      );

      stream.on('data', (obj: any) => {
        if (options?.maxKeys && results.length >= options.maxKeys) {
          // Destroy the stream to stop fetching additional objects from MinIO
          stream.destroy();
          return;
        }
        results.push({
          key: obj.name,
          size: obj.size,
          lastModified: obj.lastModified,
          etag: obj.etag,
        });
      });

      stream.on('end', () => resolve(results));
      // Handle stream close (triggered by destroy()) - resolve with collected results
      stream.on('close', () => resolve(results));
      stream.on('error', (err: Error) => {
        this.logger.error(`Failed to list objects in ${bucket}: ${err.message}`);
        reject(
          new InternalServerErrorException(
            `Failed to list files: ${err.message}`,
          ),
        );
      });
    });
  }

  /**
   * Check if an object exists in a bucket.
   *
   * @param bucket - Bucket name
   * @param key - Object key
   * @returns true if the object exists, false otherwise
   */
  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, key);
      return true;
    } catch (error: any) {
      if (
        error.code === 'NoSuchKey' ||
        error.code === 'NotFound' ||
        error.message?.includes('Not Found') ||
        error.message?.includes('does not exist')
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get metadata for an object.
   *
   * @param bucket - Bucket name
   * @param key - Object key
   * @returns Object metadata (size, contentType, lastModified, metadata)
   */
  async getObjectMetadata(
    bucket: string,
    key: string,
  ): Promise<ObjectMetadata> {
    try {
      const stat = await this.client.statObject(bucket, key);
      return {
        size: stat.size,
        contentType: stat.metaData?.['content-type'] || 'application/octet-stream',
        lastModified: stat.lastModified,
        metadata: stat.metaData || {},
      };
    } catch (error: any) {
      if (
        error.code === 'NoSuchKey' ||
        error.code === 'NotFound' ||
        error.message?.includes('Not Found') ||
        error.message?.includes('does not exist')
      ) {
        throw new NotFoundException(
          `Object not found: ${bucket}/${key}`,
        );
      }
      throw error;
    }
  }

  /**
   * Copy an object between buckets or within the same bucket.
   *
   * @param sourceBucket - Source bucket name
   * @param sourceKey - Source object key
   * @param destBucket - Destination bucket name
   * @param destKey - Destination object key
   */
  async copyObject(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
  ): Promise<void> {
    await this.client.copyObject(destBucket, destKey, `/${sourceBucket}/${sourceKey}`);
  }

  /**
   * Build a workspace-scoped object key.
   * Validates no segment contains '..' (path traversal prevention).
   *
   * @param workspaceId - Workspace identifier
   * @param segments - Additional path segments
   * @returns Constructed key string
   */
  buildKey(workspaceId: string, ...segments: string[]): string {
    const allSegments = [workspaceId, ...segments];

    for (const segment of allSegments) {
      if (segment.includes('..')) {
        throw new BadRequestException(
          'Path traversal detected: segment contains ".."',
        );
      }
    }

    return allSegments.join('/');
  }

  /**
   * Get the underlying MinIO client (used by health checks).
   */
  getClient(): Minio.Client {
    return this.client;
  }

  /**
   * Validate that a bucket name is in the allowed list.
   */
  private validateBucketName(bucket: string): void {
    const allowedBuckets = Object.values(STORAGE_BUCKETS) as string[];
    if (!allowedBuckets.includes(bucket)) {
      throw new BadRequestException(
        `Invalid bucket name: ${bucket}. Allowed: ${allowedBuckets.join(', ')}`,
      );
    }
  }

  /**
   * Collect a readable stream into a Buffer.
   */
  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
