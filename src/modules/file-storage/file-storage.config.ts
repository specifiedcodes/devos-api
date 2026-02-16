/**
 * File Storage Configuration
 * Story 16.1: MinIO S3 Storage Setup (AC4)
 *
 * Configuration loader for MinIO/S3-compatible storage.
 * Reads from environment variables via NestJS ConfigService.
 */

import { ConfigService } from '@nestjs/config';
import { FileStorageConfig } from './interfaces/file-storage.interfaces';

/**
 * Load file storage configuration from environment variables.
 * Provides sensible defaults for local development.
 */
export function loadFileStorageConfig(
  configService: ConfigService,
): FileStorageConfig {
  return {
    endpoint: configService.get<string>('MINIO_ENDPOINT', 'localhost'),
    port: parseInt(
      configService.get<string>('MINIO_PORT', '9000'),
      10,
    ),
    useSSL:
      configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
    accessKey: configService.get<string>(
      'MINIO_ACCESS_KEY',
      'devos_minio',
    ),
    secretKey: configService.get<string>(
      'MINIO_SECRET_KEY',
      'devos_minio_password',
    ),
    buckets: {
      uploads: configService.get<string>(
        'MINIO_BUCKET_UPLOADS',
        'devos-uploads',
      ),
      cliSessions: configService.get<string>(
        'MINIO_BUCKET_CLI_SESSIONS',
        'devos-cli-sessions',
      ),
      exports: configService.get<string>(
        'MINIO_BUCKET_EXPORTS',
        'devos-exports',
      ),
      backups: configService.get<string>(
        'MINIO_BUCKET_BACKUPS',
        'devos-backups',
      ),
    },
    maxFileSizeMB: parseInt(
      configService.get<string>('MINIO_MAX_FILE_SIZE_MB', '100'),
      10,
    ),
  };
}
