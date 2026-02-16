/**
 * FileStorageService Unit Tests
 * Story 16.1: MinIO S3 Storage Setup
 *
 * All tests mock the MinIO client to avoid requiring a running MinIO instance.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Readable } from 'stream';
import { FileStorageService } from '../file-storage.service';
import { STORAGE_BUCKETS } from '../constants/buckets';

// Mock the minio module
jest.mock('minio', () => {
  const mockClient = {
    bucketExists: jest.fn(),
    makeBucket: jest.fn(),
    putObject: jest.fn(),
    getObject: jest.fn(),
    presignedGetObject: jest.fn(),
    removeObject: jest.fn(),
    listObjectsV2: jest.fn(),
    statObject: jest.fn(),
    copyObject: jest.fn(),
    listBuckets: jest.fn(),
  };

  return {
    Client: jest.fn().mockImplementation(() => mockClient),
    CopySourceOptions: jest.fn(),
    CopyDestinationOptions: jest.fn(),
    __mockClient: mockClient,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const minioMock = require('minio');

describe('FileStorageService', () => {
  let service: FileStorageService;
  let mockClient: any;
  let configService: ConfigService;

  const mockConfigValues: Record<string, string> = {
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'devos_minio',
    MINIO_SECRET_KEY: 'devos_minio_password',
    MINIO_BUCKET_UPLOADS: 'devos-uploads',
    MINIO_BUCKET_CLI_SESSIONS: 'devos-cli-sessions',
    MINIO_BUCKET_EXPORTS: 'devos-exports',
    MINIO_BUCKET_BACKUPS: 'devos-backups',
    MINIO_MAX_FILE_SIZE_MB: '100',
  };

  beforeEach(async () => {
    mockClient = minioMock.__mockClient;

    // Reset all mocks
    Object.values(mockClient).forEach((mock: any) => mock.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              return mockConfigValues[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FileStorageService>(FileStorageService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('onModuleInit', () => {
    it('should initialize and create all buckets when none exist', async () => {
      mockClient.bucketExists.mockResolvedValue(false);
      mockClient.makeBucket.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockClient.bucketExists).toHaveBeenCalledTimes(4);
      expect(mockClient.makeBucket).toHaveBeenCalledTimes(4);
      expect(mockClient.makeBucket).toHaveBeenCalledWith('devos-uploads');
      expect(mockClient.makeBucket).toHaveBeenCalledWith('devos-cli-sessions');
      expect(mockClient.makeBucket).toHaveBeenCalledWith('devos-exports');
      expect(mockClient.makeBucket).toHaveBeenCalledWith('devos-backups');
    });

    it('should skip existing buckets on init', async () => {
      mockClient.bucketExists.mockResolvedValue(true);

      await service.onModuleInit();

      expect(mockClient.bucketExists).toHaveBeenCalledTimes(4);
      expect(mockClient.makeBucket).not.toHaveBeenCalled();
    });

    it('should handle partial bucket existence on init', async () => {
      mockClient.bucketExists
        .mockResolvedValueOnce(true)  // devos-uploads exists
        .mockResolvedValueOnce(false) // devos-cli-sessions doesn't
        .mockResolvedValueOnce(true)  // devos-exports exists
        .mockResolvedValueOnce(false); // devos-backups doesn't
      mockClient.makeBucket.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockClient.makeBucket).toHaveBeenCalledTimes(2);
    });
  });

  describe('upload', () => {
    beforeEach(async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should store object with metadata', async () => {
      mockClient.putObject.mockResolvedValue({ etag: 'test-etag' });

      const buffer = Buffer.from('test data');
      const result = await service.upload(
        'devos-uploads',
        'ws1/proj1/file.png',
        buffer,
        { contentType: 'image/png' },
      );

      expect(result).toBe('ws1/proj1/file.png');
      expect(mockClient.putObject).toHaveBeenCalledWith(
        'devos-uploads',
        'ws1/proj1/file.png',
        buffer,
        buffer.length,
        { 'Content-Type': 'image/png' },
      );
    });

    it('should reject files exceeding size limit', async () => {
      const maxSizeBytes = 100 * 1024 * 1024; // 100MB
      const oversizedBuffer = Buffer.alloc(maxSizeBytes + 1);

      await expect(
        service.upload('devos-uploads', 'ws1/file.bin', oversizedBuffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid bucket name', async () => {
      const buffer = Buffer.from('test data');

      await expect(
        service.upload('invalid-bucket', 'ws1/file.png', buffer),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException on MinIO client error', async () => {
      mockClient.putObject.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.upload(
          'devos-uploads',
          'ws1/file.png',
          Buffer.from('data'),
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('download', () => {
    beforeEach(async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should return buffer from object stream', async () => {
      const testData = 'hello world';
      const readable = new Readable();
      readable.push(Buffer.from(testData));
      readable.push(null);

      mockClient.getObject.mockResolvedValue(readable);

      const result = await service.download('devos-uploads', 'ws1/file.txt');

      expect(result).toEqual(Buffer.from(testData));
    });

    it('should throw NotFoundException for missing object', async () => {
      const error = new Error('Not Found') as any;
      error.code = 'NoSuchKey';
      mockClient.getObject.mockRejectedValue(error);

      await expect(
        service.download('devos-uploads', 'ws1/missing.txt'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSignedUrl', () => {
    beforeEach(async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should return presigned URL with default expiry', async () => {
      mockClient.presignedGetObject.mockResolvedValue(
        'http://localhost:9000/devos-uploads/ws1/file.png?signature=abc',
      );

      const url = await service.getSignedUrl('devos-uploads', 'ws1/file.png');

      expect(url).toContain('http://localhost:9000');
      expect(mockClient.presignedGetObject).toHaveBeenCalledWith(
        'devos-uploads',
        'ws1/file.png',
        3600,
      );
    });

    it('should clamp expiry to 7-day maximum', async () => {
      mockClient.presignedGetObject.mockResolvedValue('http://signed-url');

      await service.getSignedUrl('devos-uploads', 'ws1/file.png', 999999);

      expect(mockClient.presignedGetObject).toHaveBeenCalledWith(
        'devos-uploads',
        'ws1/file.png',
        604800,
      );
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should remove object idempotently', async () => {
      mockClient.removeObject.mockResolvedValue(undefined);

      await expect(
        service.delete('devos-uploads', 'ws1/file.png'),
      ).resolves.toBeUndefined();

      expect(mockClient.removeObject).toHaveBeenCalledWith(
        'devos-uploads',
        'ws1/file.png',
      );
    });

    it('should not throw if object does not exist', async () => {
      const error = new Error('Not Found') as any;
      error.code = 'NoSuchKey';
      mockClient.removeObject.mockRejectedValue(error);

      await expect(
        service.delete('devos-uploads', 'ws1/missing.png'),
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should return file info array', async () => {
      const mockObjects = [
        { name: 'ws1/file1.png', size: 1024, lastModified: new Date('2026-01-01'), etag: 'abc' },
        { name: 'ws1/file2.png', size: 2048, lastModified: new Date('2026-01-02'), etag: 'def' },
        { name: 'ws1/file3.png', size: 4096, lastModified: new Date('2026-01-03'), etag: 'ghi' },
      ];

      const stream = new Readable({ objectMode: true });
      mockObjects.forEach((obj) => stream.push(obj));
      stream.push(null);
      mockClient.listObjectsV2.mockReturnValue(stream);

      const results = await service.list('devos-uploads');

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        key: 'ws1/file1.png',
        size: 1024,
        lastModified: new Date('2026-01-01'),
        etag: 'abc',
      });
    });

    it('should filter by prefix', async () => {
      const stream = new Readable({ objectMode: true });
      stream.push({ name: 'ws1/proj1/file.png', size: 1024, lastModified: new Date(), etag: 'abc' });
      stream.push(null);
      mockClient.listObjectsV2.mockReturnValue(stream);

      await service.list('devos-uploads', { prefix: 'ws1/proj1/' });

      expect(mockClient.listObjectsV2).toHaveBeenCalledWith(
        'devos-uploads',
        'ws1/proj1/',
        true,
      );
    });
  });

  describe('exists', () => {
    beforeEach(async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should return true for existing object', async () => {
      mockClient.statObject.mockResolvedValue({
        size: 1024,
        metaData: {},
        lastModified: new Date(),
      });

      const result = await service.exists('devos-uploads', 'ws1/file.png');

      expect(result).toBe(true);
    });

    it('should return false for missing object', async () => {
      const error = new Error('Not Found') as any;
      error.code = 'NoSuchKey';
      mockClient.statObject.mockRejectedValue(error);

      const result = await service.exists('devos-uploads', 'ws1/missing.png');

      expect(result).toBe(false);
    });
  });

  describe('getObjectMetadata', () => {
    beforeEach(async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should return parsed metadata', async () => {
      const date = new Date('2026-01-15T10:00:00Z');
      mockClient.statObject.mockResolvedValue({
        size: 1024,
        metaData: { 'content-type': 'image/png', 'x-custom': 'value' },
        lastModified: date,
      });

      const metadata = await service.getObjectMetadata(
        'devos-uploads',
        'ws1/file.png',
      );

      expect(metadata).toEqual({
        size: 1024,
        contentType: 'image/png',
        lastModified: date,
        metadata: { 'content-type': 'image/png', 'x-custom': 'value' },
      });
    });
  });

  describe('copyObject', () => {
    beforeEach(async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should copy between buckets', async () => {
      mockClient.copyObject.mockResolvedValue({ etag: 'new-etag' });

      await service.copyObject(
        'devos-uploads',
        'ws1/file.png',
        'devos-backups',
        'ws1/archive/file.png',
      );

      expect(mockClient.copyObject).toHaveBeenCalledWith(
        'devos-backups',
        'ws1/archive/file.png',
        '/devos-uploads/ws1/file.png',
      );
    });
  });

  describe('buildKey', () => {
    beforeEach(async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should construct workspace-scoped keys', () => {
      const key = service.buildKey('ws1', 'proj1', 'file.png');
      expect(key).toBe('ws1/proj1/file.png');
    });

    it('should reject path traversal attempts', () => {
      expect(() =>
        service.buildKey('ws1', '..', 'etc', 'passwd'),
      ).toThrow(BadRequestException);
    });

    it('should handle nested paths', () => {
      const key = service.buildKey(
        'ws1',
        'proj1',
        'src',
        'components',
        'App.tsx',
      );
      expect(key).toBe('ws1/proj1/src/components/App.tsx');
    });
  });

  describe('getClient', () => {
    it('should return the MinIO client instance', async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await service.onModuleInit();

      const client = service.getClient();
      expect(client).toBeDefined();
      expect(client.bucketExists).toBeDefined();
    });
  });
});
