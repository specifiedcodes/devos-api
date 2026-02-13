import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  ContextRecoveryService,
  ContextTier,
} from './context-recovery.service';
import { Agent } from '../../database/entities/agent.entity';
import { ContextSnapshot } from '../../database/entities/context-snapshot.entity';
import { RedisService } from '../redis/redis.service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ContextRecoveryService', () => {
  let service: ContextRecoveryService;
  let mockRedisService: any;
  let mockAgentRepository: any;
  let mockSnapshotRepository: any;
  let mockConfigService: any;

  const mockAgentId = '55555555-5555-5555-5555-555555555555';
  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const basePath = './data/agent-contexts';

  const mockAgent = {
    id: mockAgentId,
    workspaceId: mockWorkspaceId,
    context: { lastTask: 'test' },
  };

  const smallContext = { message: 'small context data' }; // <1MB
  const createLargeContext = (sizeTarget: number): Record<string, any> => {
    // Create a context that is approximately the target size in bytes
    const padding = 'x'.repeat(sizeTarget);
    return { data: padding };
  };

  beforeEach(async () => {
    mockRedisService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
    };

    mockAgentRepository = {
      findOne: jest.fn().mockResolvedValue(mockAgent),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockSnapshotRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity: any) =>
        Promise.resolve({ id: 'snap-id', ...entity }),
      ),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
        getMany: jest.fn().mockResolvedValue([]),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      }),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(basePath),
    };

    // Reset fs mocks
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue('{}');
    mockedFs.readdir.mockResolvedValue([] as any);
    mockedFs.rm.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextRecoveryService,
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: getRepositoryToken(Agent),
          useValue: mockAgentRepository,
        },
        {
          provide: getRepositoryToken(ContextSnapshot),
          useValue: mockSnapshotRepository,
        },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ContextRecoveryService>(ContextRecoveryService);
    jest.clearAllMocks();

    // Re-apply default mocks after clearAllMocks
    mockAgentRepository.findOne.mockResolvedValue(mockAgent);
    mockAgentRepository.update.mockResolvedValue({ affected: 1 });
    mockRedisService.set.mockResolvedValue(undefined);
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.del.mockResolvedValue(undefined);
    mockSnapshotRepository.save.mockImplementation((entity: any) =>
      Promise.resolve({ id: 'snap-id', ...entity }),
    );
    mockSnapshotRepository.delete.mockResolvedValue({ affected: 0 });
    mockSnapshotRepository.find.mockResolvedValue([]);
    mockSnapshotRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(null),
    });
    mockConfigService.get.mockReturnValue(basePath);
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue('{}');
    mockedFs.readdir.mockResolvedValue([] as any);
    mockedFs.rm.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // determineTier Tests
  // ==========================================================
  describe('determineTier', () => {
    it('should classify context <1MB as TIER_1_ACTIVE', () => {
      const result = service.determineTier(500 * 1024); // 500KB
      expect(result).toBe(ContextTier.TIER_1_ACTIVE);
    });

    it('should classify context exactly at 1MB as TIER_1_ACTIVE', () => {
      const result = service.determineTier(1024 * 1024);
      expect(result).toBe(ContextTier.TIER_1_ACTIVE);
    });

    it('should classify context 1MB-10MB as TIER_2_RECENT', () => {
      const result = service.determineTier(5 * 1024 * 1024); // 5MB
      expect(result).toBe(ContextTier.TIER_2_RECENT);
    });

    it('should classify context >10MB as TIER_3_ARCHIVED', () => {
      const result = service.determineTier(15 * 1024 * 1024); // 15MB
      expect(result).toBe(ContextTier.TIER_3_ARCHIVED);
    });
  });

  // ==========================================================
  // saveContext Tests
  // ==========================================================
  describe('saveContext', () => {
    it('should route context <1MB to BOTH Tier 1 and Tier 2', async () => {
      const saveTier1Spy = jest.spyOn(service, 'saveTier1').mockResolvedValue(undefined);
      const saveTier2Spy = jest.spyOn(service, 'saveTier2').mockResolvedValue(undefined);

      await service.saveContext(mockAgentId, smallContext);

      expect(saveTier1Spy).toHaveBeenCalledWith(mockAgentId, smallContext);
      expect(saveTier2Spy).toHaveBeenCalledWith(mockAgentId, smallContext);
    });

    it('should route context 1MB-10MB to Tier 2 only', async () => {
      const saveTier1Spy = jest.spyOn(service, 'saveTier1').mockResolvedValue(undefined);
      const saveTier2Spy = jest.spyOn(service, 'saveTier2').mockResolvedValue(undefined);
      const saveTier3Spy = jest.spyOn(service, 'saveTier3').mockResolvedValue(undefined);

      const mediumContext = createLargeContext(2 * 1024 * 1024); // ~2MB

      await service.saveContext(mockAgentId, mediumContext);

      expect(saveTier1Spy).not.toHaveBeenCalled();
      expect(saveTier2Spy).toHaveBeenCalledWith(mockAgentId, mediumContext);
      expect(saveTier3Spy).not.toHaveBeenCalled();
    });

    it('should route context >10MB to Tier 3 with precomputed version', async () => {
      const saveTier1Spy = jest.spyOn(service, 'saveTier1').mockResolvedValue(undefined);
      const saveTier3Spy = jest.spyOn(service, 'saveTier3').mockResolvedValue(undefined);

      const largeContext = createLargeContext(11 * 1024 * 1024); // ~11MB

      await service.saveContext(mockAgentId, largeContext);

      expect(saveTier1Spy).not.toHaveBeenCalled();
      // saveTier3 is called with agentId, context, and precomputed version
      expect(saveTier3Spy).toHaveBeenCalledWith(mockAgentId, largeContext, expect.any(Number));
    });
  });

  // ==========================================================
  // Tier 1 (Redis) Tests
  // ==========================================================
  describe('saveTier1', () => {
    it('should call RedisService.set with correct key pattern and TTL', async () => {
      await service.saveTier1(mockAgentId, smallContext);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `agent:context:${mockAgentId}`,
        JSON.stringify(smallContext),
        3600,
      );
    });

    it('should handle Redis unavailability gracefully (no throw)', async () => {
      mockRedisService.set.mockRejectedValue(new Error('Redis connection refused'));

      await expect(
        service.saveTier1(mockAgentId, smallContext),
      ).resolves.not.toThrow();
    });

    it('should skip save if context exceeds Tier 1 max size', async () => {
      const largeContext = createLargeContext(2 * 1024 * 1024);

      await service.saveTier1(mockAgentId, largeContext);

      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  describe('recoverTier1', () => {
    it('should call RedisService.get with correct key', async () => {
      await service.recoverTier1(mockAgentId);

      expect(mockRedisService.get).toHaveBeenCalledWith(
        `agent:context:${mockAgentId}`,
      );
    });

    it('should return null when Redis returns null', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.recoverTier1(mockAgentId);

      expect(result).toBeNull();
    });

    it('should return parsed context when Redis has data', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(smallContext));

      const result = await service.recoverTier1(mockAgentId);

      expect(result).toEqual(smallContext);
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockRedisService.get.mockResolvedValue('not-valid-json{{{');

      const result = await service.recoverTier1(mockAgentId);

      expect(result).toBeNull();
    });
  });

  // ==========================================================
  // Tier 2 (PostgreSQL) Tests
  // ==========================================================
  describe('saveTier2', () => {
    it('should create a ContextSnapshot record in database', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(qb);

      await service.saveTier2(mockAgentId, smallContext);

      expect(mockSnapshotRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: mockAgentId,
          workspaceId: mockWorkspaceId,
          tier: ContextTier.TIER_2_RECENT,
          contextData: smallContext,
          version: 1,
        }),
      );
    });

    it('should increment version number for existing snapshots', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ version: 5 }),
      };
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(qb);

      await service.saveTier2(mockAgentId, smallContext);

      expect(mockSnapshotRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 6,
        }),
      );
    });

    it('should update agent.context column for backward compatibility', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(qb);

      await service.saveTier2(mockAgentId, smallContext);

      expect(mockAgentRepository.update).toHaveBeenCalledWith(
        mockAgentId,
        { context: smallContext },
      );
    });

    it('should not save if agent is not found', async () => {
      mockAgentRepository.findOne.mockResolvedValue(null);

      await service.saveTier2(mockAgentId, smallContext);

      expect(mockSnapshotRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('recoverTier2', () => {
    it('should return most recent snapshot context data', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          contextData: { recovered: 'from-tier2' },
          version: 3,
        }),
      };
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.recoverTier2(mockAgentId);

      expect(result).toEqual({ recovered: 'from-tier2' });
    });

    it('should fall back to agent.context when no snapshots exist', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(qb);

      mockAgentRepository.findOne.mockResolvedValue({
        id: mockAgentId,
        context: { fallback: 'agent-context' },
      });

      const result = await service.recoverTier2(mockAgentId);

      expect(result).toEqual({ fallback: 'agent-context' });
    });

    it('should return null when no context exists anywhere', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(qb);

      mockAgentRepository.findOne.mockResolvedValue({
        id: mockAgentId,
        context: null,
      });

      const result = await service.recoverTier2(mockAgentId);

      expect(result).toBeNull();
    });
  });

  // ==========================================================
  // Tier 3 (File System) Tests
  // ==========================================================
  describe('saveTier3', () => {
    it('should write JSON file to correct path', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(qb);

      await service.saveTier3(mockAgentId, smallContext);

      const expectedDir = path.join(basePath, mockWorkspaceId, mockAgentId);
      expect(mockedFs.mkdir).toHaveBeenCalledWith(expectedDir, {
        recursive: true,
      });
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(expectedDir, '1.json'),
        expect.any(String),
        'utf-8',
      );
    });

    it('should create directories recursively', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ version: 3 }),
      };
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(qb);

      await service.saveTier3(mockAgentId, smallContext);

      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true },
      );
    });
  });

  describe('recoverTier3', () => {
    it('should read most recent file for agent', async () => {
      mockedFs.readdir.mockResolvedValue(['1.json', '2.json', '3.json'] as any);

      const fileContent = {
        contextData: { recovered: 'from-tier3' },
        version: 3,
      };
      mockedFs.readFile.mockResolvedValue(JSON.stringify(fileContent));

      const result = await service.recoverTier3(mockAgentId);

      expect(result).toEqual({ recovered: 'from-tier3' });
      // Should read file with highest version (3.json)
      const expectedPath = path.join(
        basePath,
        mockWorkspaceId,
        mockAgentId,
        '3.json',
      );
      expect(mockedFs.readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
    });

    it('should return null when directory does not exist', async () => {
      mockedFs.readdir.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await service.recoverTier3(mockAgentId);

      expect(result).toBeNull();
    });

    it('should return null when no JSON files exist', async () => {
      mockedFs.readdir.mockResolvedValue([] as any);

      const result = await service.recoverTier3(mockAgentId);

      expect(result).toBeNull();
    });

    it('should handle file read errors gracefully', async () => {
      mockedFs.readdir.mockResolvedValue(['1.json'] as any);
      mockedFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await service.recoverTier3(mockAgentId);

      expect(result).toBeNull();
    });
  });

  // ==========================================================
  // recoverContext (Cascading Recovery) Tests
  // ==========================================================
  describe('recoverContext', () => {
    it('should return Tier 1 data when available (no Tier 2/3 calls)', async () => {
      const recoverTier1Spy = jest
        .spyOn(service, 'recoverTier1')
        .mockResolvedValue({ tier1: 'data' });
      const recoverTier2Spy = jest.spyOn(service, 'recoverTier2');

      const result = await service.recoverContext(mockAgentId);

      expect(result).toEqual({ tier1: 'data' });
      expect(recoverTier1Spy).toHaveBeenCalled();
      expect(recoverTier2Spy).not.toHaveBeenCalled();
    });

    it('should fall back to Tier 2 when Tier 1 misses', async () => {
      jest.spyOn(service, 'recoverTier1').mockResolvedValue(null);
      jest
        .spyOn(service, 'recoverTier2')
        .mockResolvedValue({ tier2: 'data' });
      const saveTier1Spy = jest
        .spyOn(service, 'saveTier1')
        .mockResolvedValue(undefined);

      const result = await service.recoverContext(mockAgentId);

      expect(result).toEqual({ tier2: 'data' });
      // Should promote to Tier 1
      expect(saveTier1Spy).toHaveBeenCalledWith(mockAgentId, { tier2: 'data' });
    });

    it('should fall back to Tier 3 when Tier 1 and Tier 2 miss', async () => {
      jest.spyOn(service, 'recoverTier1').mockResolvedValue(null);
      jest.spyOn(service, 'recoverTier2').mockResolvedValue(null);
      jest
        .spyOn(service, 'recoverTier3')
        .mockResolvedValue({ tier3: 'data' });
      const saveTier1Spy = jest
        .spyOn(service, 'saveTier1')
        .mockResolvedValue(undefined);

      const result = await service.recoverContext(mockAgentId);

      expect(result).toEqual({ tier3: 'data' });
      // Small context should be promoted to Tier 1
      expect(saveTier1Spy).toHaveBeenCalledWith(mockAgentId, { tier3: 'data' });
    });

    it('should return null when all tiers miss', async () => {
      jest.spyOn(service, 'recoverTier1').mockResolvedValue(null);
      jest.spyOn(service, 'recoverTier2').mockResolvedValue(null);
      jest.spyOn(service, 'recoverTier3').mockResolvedValue(null);

      const result = await service.recoverContext(mockAgentId);

      expect(result).toBeNull();
    });

    it('should promote Tier 3 recovery to Tier 1 when size <1MB', async () => {
      jest.spyOn(service, 'recoverTier1').mockResolvedValue(null);
      jest.spyOn(service, 'recoverTier2').mockResolvedValue(null);
      jest.spyOn(service, 'recoverTier3').mockResolvedValue(smallContext);
      const saveTier1Spy = jest
        .spyOn(service, 'saveTier1')
        .mockResolvedValue(undefined);
      const saveTier2Spy = jest
        .spyOn(service, 'saveTier2')
        .mockResolvedValue(undefined);

      await service.recoverContext(mockAgentId);

      expect(saveTier1Spy).toHaveBeenCalledWith(mockAgentId, smallContext);
      expect(saveTier2Spy).not.toHaveBeenCalled();
    });

    it('should promote Tier 3 recovery to Tier 2 when size 1MB-10MB', async () => {
      const mediumContext = createLargeContext(2 * 1024 * 1024); // ~2MB
      jest.spyOn(service, 'recoverTier1').mockResolvedValue(null);
      jest.spyOn(service, 'recoverTier2').mockResolvedValue(null);
      jest.spyOn(service, 'recoverTier3').mockResolvedValue(mediumContext);
      const saveTier1Spy = jest
        .spyOn(service, 'saveTier1')
        .mockResolvedValue(undefined);
      const saveTier2Spy = jest
        .spyOn(service, 'saveTier2')
        .mockResolvedValue(undefined);

      await service.recoverContext(mockAgentId);

      expect(saveTier1Spy).not.toHaveBeenCalled();
      expect(saveTier2Spy).toHaveBeenCalledWith(mockAgentId, mediumContext);
    });
  });

  // ==========================================================
  // archiveOldContexts Tests
  // ==========================================================
  describe('archiveOldContexts', () => {
    const setupArchiveQueryBuilder = (snapshots: any[]) => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(snapshots),
      };
      mockSnapshotRepository.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it('should move old snapshots to Tier 3 file storage', async () => {
      const oldSnapshot = {
        id: 'snap-1',
        agentId: mockAgentId,
        workspaceId: mockWorkspaceId,
        tier: ContextTier.TIER_2_RECENT,
        contextData: { old: 'data' },
        sizeBytes: 100,
        version: 1,
        metadata: null,
        createdAt: new Date('2025-01-01'),
      };
      setupArchiveQueryBuilder([oldSnapshot]);

      await service.archiveOldContexts();

      // Should write file
      expect(mockedFs.mkdir).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalled();
      // Should update snapshot
      expect(mockSnapshotRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: ContextTier.TIER_3_ARCHIVED,
          contextData: null,
          metadata: expect.objectContaining({
            archivedAt: expect.any(String),
            filePath: expect.any(String),
          }),
        }),
      );
    });

    it('should return count of archived items', async () => {
      const snapshots = [
        {
          id: 'snap-1',
          agentId: mockAgentId,
          workspaceId: mockWorkspaceId,
          tier: ContextTier.TIER_2_RECENT,
          contextData: { old1: 'data' },
          sizeBytes: 100,
          version: 1,
          metadata: null,
          createdAt: new Date('2025-01-01'),
        },
        {
          id: 'snap-2',
          agentId: mockAgentId,
          workspaceId: mockWorkspaceId,
          tier: ContextTier.TIER_2_RECENT,
          contextData: { old2: 'data' },
          sizeBytes: 200,
          version: 2,
          metadata: null,
          createdAt: new Date('2025-01-01'),
        },
      ];
      setupArchiveQueryBuilder(snapshots);

      const count = await service.archiveOldContexts();

      expect(count).toBe(2);
    });

    it('should handle empty result set', async () => {
      setupArchiveQueryBuilder([]);

      const count = await service.archiveOldContexts();

      expect(count).toBe(0);
    });

    it('should filter null context data at database level', async () => {
      // The query now uses "context_data IS NOT NULL" in the WHERE clause
      // so metadata-only records are excluded before reaching application code
      const qb = setupArchiveQueryBuilder([]);

      await service.archiveOldContexts();

      expect(qb.andWhere).toHaveBeenCalledWith(
        'snapshot.context_data IS NOT NULL',
      );
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // deleteContext Tests
  // ==========================================================
  describe('deleteContext', () => {
    it('should remove context from all three tiers', async () => {
      mockSnapshotRepository.delete.mockResolvedValue({ affected: 3 });

      const result = await service.deleteContext(mockAgentId);

      // Tier 1: Redis del called
      expect(mockRedisService.del).toHaveBeenCalledWith(
        `agent:context:${mockAgentId}`,
      );
      // Tier 2: Snapshot delete called
      expect(mockSnapshotRepository.delete).toHaveBeenCalledWith({
        agentId: mockAgentId,
      });
      // Tier 3: File system rm called
      expect(mockedFs.rm).toHaveBeenCalledWith(
        path.join(basePath, mockWorkspaceId, mockAgentId),
        { recursive: true, force: true },
      );

      expect(result.tier1Cleaned).toBe(true);
      expect(result.tier2Deleted).toBe(3);
      expect(result.tier3Cleaned).toBe(true);
    });

    it('should handle partial failures gracefully', async () => {
      mockRedisService.del.mockRejectedValue(new Error('Redis down'));
      mockSnapshotRepository.delete.mockResolvedValue({ affected: 2 });

      const result = await service.deleteContext(mockAgentId);

      // Redis failed but others should still proceed
      expect(result.tier1Cleaned).toBe(false);
      expect(result.tier2Deleted).toBe(2);
      expect(result.tier3Cleaned).toBe(true);
    });
  });

  // ==========================================================
  // getContextHealth Tests
  // ==========================================================
  describe('getContextHealth', () => {
    it('should return correct availability for each tier', async () => {
      // Tier 1: Redis has data
      mockRedisService.get.mockResolvedValue(JSON.stringify(smallContext));
      // Tier 2: Snapshots exist
      mockSnapshotRepository.find.mockResolvedValue([
        { id: 'snap-1' },
        { id: 'snap-2' },
      ]);
      // Tier 3: Files exist
      mockedFs.readdir.mockResolvedValue(['1.json', '2.json'] as any);

      const health = await service.getContextHealth(mockAgentId);

      expect(health.tier1Available).toBe(true);
      expect(health.tier2Available).toBe(true);
      expect(health.tier2SnapshotCount).toBe(2);
      expect(health.tier3Available).toBe(true);
      expect(health.tier3FileCount).toBe(2);
    });

    it('should return false when tiers are empty', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockSnapshotRepository.find.mockResolvedValue([]);
      mockedFs.readdir.mockRejectedValue(new Error('ENOENT'));

      const health = await service.getContextHealth(mockAgentId);

      expect(health.tier1Available).toBe(false);
      expect(health.tier2Available).toBe(false);
      expect(health.tier3Available).toBe(false);
    });
  });
});
