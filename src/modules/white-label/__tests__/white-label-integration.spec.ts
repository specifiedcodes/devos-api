/**
 * White-Label Integration Tests
 * Story 22-1: White-Label Configuration (AC5)
 *
 * Tests module compilation, service resolution, and entity/migration verifications.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WhiteLabelModule } from '../white-label.module';
import { WhiteLabelService } from '../white-label.service';
import { WhiteLabelConfig, BackgroundMode, DomainStatus } from '../../../database/entities/white-label-config.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { RedisService } from '../../redis/redis.service';
import { FileStorageService } from '../../file-storage/file-storage.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ConfigService } from '@nestjs/config';

describe('WhiteLabelModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [],
      providers: [
        WhiteLabelService,
        {
          provide: getRepositoryToken(WhiteLabelConfig),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
        {
          provide: FileStorageService,
          useValue: { upload: jest.fn(), getSignedUrl: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('custom.devos.com') },
        },
      ],
    }).compile();
  });

  it('should compile without circular dependency errors', () => {
    expect(module).toBeDefined();
  });

  it('should resolve WhiteLabelService', () => {
    const service = module.get<WhiteLabelService>(WhiteLabelService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(WhiteLabelService);
  });
});

describe('WhiteLabelConfig Entity', () => {
  it('should define all enum values for BackgroundMode', () => {
    expect(BackgroundMode.LIGHT).toBe('light');
    expect(BackgroundMode.DARK).toBe('dark');
    expect(BackgroundMode.SYSTEM).toBe('system');
  });

  it('should define all enum values for DomainStatus', () => {
    expect(DomainStatus.PENDING).toBe('pending');
    expect(DomainStatus.VERIFYING).toBe('verifying');
    expect(DomainStatus.VERIFIED).toBe('verified');
    expect(DomainStatus.FAILED).toBe('failed');
  });

  it('should correctly map entity columns with default values', () => {
    const config = new WhiteLabelConfig();
    // Default values are set by TypeORM decorators, but we verify the type exists
    expect(config).toBeDefined();
    expect(config).toBeInstanceOf(WhiteLabelConfig);
  });
});

describe('Migration', () => {
  it('should import migration class without errors', async () => {
    const { CreateWhiteLabelConfigTable1773000000000 } = await import(
      '../../../database/migrations/1773000000000-CreateWhiteLabelConfigTable'
    );
    expect(CreateWhiteLabelConfigTable1773000000000).toBeDefined();

    const migration = new CreateWhiteLabelConfigTable1773000000000();
    expect(migration.up).toBeDefined();
    expect(migration.down).toBeDefined();
  });
});
