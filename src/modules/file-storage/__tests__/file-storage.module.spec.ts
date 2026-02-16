/**
 * FileStorageModule Unit Tests
 * Story 16.1: MinIO S3 Storage Setup
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FileStorageModule } from '../file-storage.module';
import { FileStorageService } from '../file-storage.service';

// Mock minio to prevent actual connection attempts
jest.mock('minio', () => {
  const mockClient = {
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
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
  };
});

describe('FileStorageModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [FileStorageModule],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => defaultValue),
          },
        },
      ],
    }).compile();

    // Initialize the module to trigger onModuleInit
    await module.init();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined and export FileStorageService', () => {
    const service = module.get<FileStorageService>(FileStorageService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(FileStorageService);
  });

  it('should be decorated with @Global()', () => {
    // Verify the module metadata indicates global scope
    const moduleRef = Reflect.getMetadata('__module:global__', FileStorageModule);
    expect(moduleRef).toBe(true);
  });
});
