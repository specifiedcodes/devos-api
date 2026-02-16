/**
 * FileStorageConfig Unit Tests
 * Story 16.1: MinIO S3 Storage Setup
 */

import { ConfigService } from '@nestjs/config';
import { loadFileStorageConfig } from '../file-storage.config';

describe('FileStorageConfig', () => {
  it('should load configuration from environment variables', () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          MINIO_ENDPOINT: 's3.amazonaws.com',
          MINIO_PORT: '443',
          MINIO_USE_SSL: 'true',
          MINIO_ACCESS_KEY: 'my-access-key',
          MINIO_SECRET_KEY: 'my-secret-key',
          MINIO_BUCKET_UPLOADS: 'custom-uploads',
          MINIO_BUCKET_CLI_SESSIONS: 'custom-sessions',
          MINIO_BUCKET_EXPORTS: 'custom-exports',
          MINIO_BUCKET_BACKUPS: 'custom-backups',
          MINIO_MAX_FILE_SIZE_MB: '200',
        };
        return values[key] ?? defaultValue;
      }),
    } as unknown as ConfigService;

    const config = loadFileStorageConfig(configService);

    expect(config.endpoint).toBe('s3.amazonaws.com');
    expect(config.port).toBe(443);
    expect(config.useSSL).toBe(true);
    expect(config.accessKey).toBe('my-access-key');
    expect(config.secretKey).toBe('my-secret-key');
    expect(config.buckets.uploads).toBe('custom-uploads');
    expect(config.buckets.cliSessions).toBe('custom-sessions');
    expect(config.buckets.exports).toBe('custom-exports');
    expect(config.buckets.backups).toBe('custom-backups');
    expect(config.maxFileSizeMB).toBe(200);
  });

  it('should use default values when env vars not set', () => {
    const configService = {
      get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
    } as unknown as ConfigService;

    const config = loadFileStorageConfig(configService);

    expect(config.endpoint).toBe('localhost');
    expect(config.port).toBe(9000);
    expect(config.useSSL).toBe(false);
  });

  it('should parse MINIO_USE_SSL string "true" to boolean true', () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MINIO_USE_SSL') return 'true';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const config = loadFileStorageConfig(configService);
    expect(config.useSSL).toBe(true);
  });

  it('should parse MINIO_USE_SSL string "false" to boolean false', () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MINIO_USE_SSL') return 'false';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const config = loadFileStorageConfig(configService);
    expect(config.useSSL).toBe(false);
  });

  it('should parse MINIO_PORT string to number', () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MINIO_PORT') return '9000';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const config = loadFileStorageConfig(configService);
    expect(config.port).toBe(9000);
  });

  it('should default maxFileSizeMB to 100 when not set', () => {
    const configService = {
      get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
    } as unknown as ConfigService;

    const config = loadFileStorageConfig(configService);
    expect(config.maxFileSizeMB).toBe(100);
  });
});
