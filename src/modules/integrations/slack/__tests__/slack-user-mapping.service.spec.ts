/**
 * SlackUserMappingService Tests
 * Story 21.1: Slack OAuth Integration (AC2)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SlackUserMappingService } from '../services/slack-user-mapping.service';
import { SlackUserMapping } from '../../../../database/entities/slack-user-mapping.entity';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { User } from '../../../../database/entities/user.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('SlackUserMappingService', () => {
  let service: SlackUserMappingService;
  let mockMappingRepo: any;
  let mockIntegrationRepo: any;
  let mockUserRepo: any;
  let mockEncryptionService: any;
  let mockRedisService: any;

  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const integrationId = '22222222-2222-2222-2222-222222222222';
  const devosUserId = '33333333-3333-3333-3333-333333333333';
  const slackUserId = 'U12345ABC';

  beforeEach(async () => {
    mockMappingRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: any) => ({ id: 'new-id', ...data })),
      save: jest.fn((data: any) => Promise.resolve({ id: 'new-id', ...data })),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    mockIntegrationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: integrationId,
        workspaceId,
        botToken: 'encrypted-token',
        status: 'active',
      }),
    };

    mockUserRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
    };

    mockEncryptionService = {
      encrypt: jest.fn().mockReturnValue('encrypted'),
      decrypt: jest.fn().mockReturnValue('xoxb-decrypted-token'),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackUserMappingService,
        { provide: getRepositoryToken(SlackUserMapping), useValue: mockMappingRepo },
        { provide: getRepositoryToken(SlackIntegration), useValue: mockIntegrationRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<SlackUserMappingService>(SlackUserMappingService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('autoMapByEmail', () => {
    const mockSlackMembers = {
      ok: true,
      members: [
        { id: 'U001', name: 'alice', is_bot: false, deleted: false, profile: { email: 'alice@example.com', display_name: 'Alice', real_name: 'Alice Smith', image_72: 'https://img/alice' } },
        { id: 'U002', name: 'bob', is_bot: false, deleted: false, profile: { email: 'bob@example.com', display_name: 'Bob', real_name: 'Bob Jones', image_72: 'https://img/bob' } },
        { id: 'U003', name: 'botuser', is_bot: true, deleted: false, profile: { email: 'bot@example.com', display_name: 'Bot', image_72: '' } },
        { id: 'U004', name: 'charlie', is_bot: false, deleted: false, profile: { display_name: 'Charlie', real_name: 'Charlie' } }, // no email
      ],
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve(mockSlackMembers),
      });
    });

    it('maps Slack users to DevOS users when email matches', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn()
          .mockResolvedValueOnce({ id: devosUserId, email: 'alice@example.com' })
          .mockResolvedValueOnce(null),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.autoMapByEmail(workspaceId, integrationId);

      expect(result.mapped).toBe(1);
      expect(mockMappingRepo.save).toHaveBeenCalledTimes(1);
    });

    it('returns unmatched Slack users when no email match found', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.autoMapByEmail(workspaceId, integrationId);

      expect(result.mapped).toBe(0);
      expect(result.unmatched.length).toBeGreaterThan(0);
    });

    it('filters out bot users from Slack user list', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.autoMapByEmail(workspaceId, integrationId);

      // Bot user (U003) should not appear in unmatched as a human user without email
      const botInUnmatched = result.unmatched.find(u => u.slackUserId === 'U003');
      expect(botInUnmatched).toBeUndefined();
    });

    it('skips users that are already mapped', async () => {
      mockMappingRepo.find.mockResolvedValue([
        { slackUserId: 'U001', devosUserId: 'existing-user-id' },
      ]);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.autoMapByEmail(workspaceId, integrationId);

      // U001 should be skipped since it's already mapped
      const aliceMapping = mockMappingRepo.save.mock.calls.find(
        (call: any[]) => call[0]?.slackUserId === 'U001',
      );
      expect(aliceMapping).toBeUndefined();
    });

    it('handles Slack API errors gracefully (returns empty result)', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ ok: false, error: 'invalid_auth' }),
      });

      const result = await service.autoMapByEmail(workspaceId, integrationId);

      expect(result.mapped).toBe(0);
      expect(result.unmatched).toEqual([]);
    });
  });

  describe('mapUser', () => {
    it('creates new mapping successfully', async () => {
      const result = await service.mapUser(workspaceId, integrationId, devosUserId, slackUserId);

      expect(mockMappingRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        workspaceId,
        slackIntegrationId: integrationId,
        devosUserId,
        slackUserId,
        isAutoMapped: false,
      }));
      expect(mockMappingRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws ConflictException when Slack user already mapped', async () => {
      mockMappingRepo.findOne
        .mockResolvedValueOnce({ id: 'existing', slackUserId }) // Slack user found
        .mockResolvedValueOnce(null);

      await expect(
        service.mapUser(workspaceId, integrationId, devosUserId, slackUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when DevOS user already mapped', async () => {
      mockMappingRepo.findOne
        .mockResolvedValueOnce(null) // Slack user not found
        .mockResolvedValueOnce({ id: 'existing', devosUserId }); // DevOS user found

      await expect(
        service.mapUser(workspaceId, integrationId, devosUserId, slackUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('validates slackUserId format', async () => {
      await expect(
        service.mapUser(workspaceId, integrationId, devosUserId, 'invalid-id'),
      ).rejects.toThrow(ConflictException);
    });

    it('invalidates cache after mapping', async () => {
      await service.mapUser(workspaceId, integrationId, devosUserId, slackUserId);
      expect(mockRedisService.del).toHaveBeenCalledWith(`slack-user-map:${workspaceId}:${slackUserId}`);
    });
  });

  describe('unmapUser', () => {
    it('removes mapping and invalidates cache', async () => {
      mockMappingRepo.findOne.mockResolvedValue({
        id: 'mapping-id',
        workspaceId,
        slackUserId: 'U001',
      });

      await service.unmapUser(workspaceId, 'mapping-id');

      expect(mockRedisService.del).toHaveBeenCalledWith(`slack-user-map:${workspaceId}:U001`);
      expect(mockMappingRepo.remove).toHaveBeenCalled();
    });

    it('throws NotFoundException for non-existent mapping', async () => {
      mockMappingRepo.findOne.mockResolvedValue(null);

      await expect(
        service.unmapUser(workspaceId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMappings', () => {
    it('returns all mappings for workspace', async () => {
      const mockMappings = [
        { id: '1', workspaceId, slackUserId: 'U001', devosUserId: 'user1' },
        { id: '2', workspaceId, slackUserId: 'U002', devosUserId: 'user2' },
      ];
      mockMappingRepo.find.mockResolvedValue(mockMappings);

      const result = await service.getMappings(workspaceId);

      expect(result).toHaveLength(2);
      expect(mockMappingRepo.find).toHaveBeenCalledWith({
        where: { workspaceId },
        order: { mappedAt: 'DESC' },
      });
    });

    it('returns empty array when no mappings exist', async () => {
      mockMappingRepo.find.mockResolvedValue([]);

      const result = await service.getMappings(workspaceId);

      expect(result).toEqual([]);
    });
  });

  describe('listSlackUsers', () => {
    it('returns Slack user list from API', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({
          ok: true,
          members: [
            { id: 'U001', name: 'alice', is_bot: false, deleted: false, profile: { display_name: 'Alice', email: 'alice@test.com', image_72: 'https://img' } },
          ],
        }),
      });

      const result = await service.listSlackUsers(workspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].slackUserId).toBe('U001');
      expect(result[0].displayName).toBe('Alice');
    });

    it('returns empty array when integration not found', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);

      const result = await service.listSlackUsers(workspaceId);

      expect(result).toEqual([]);
    });
  });

  describe('findDevosUserBySlackId', () => {
    it('returns DevOS userId from cache on hit', async () => {
      mockRedisService.get.mockResolvedValue(devosUserId);

      const result = await service.findDevosUserBySlackId(workspaceId, slackUserId);

      expect(result).toBe(devosUserId);
      expect(mockMappingRepo.findOne).not.toHaveBeenCalled();
    });

    it('queries DB and caches on cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockMappingRepo.findOne.mockResolvedValue({ devosUserId });

      const result = await service.findDevosUserBySlackId(workspaceId, slackUserId);

      expect(result).toBe(devosUserId);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `slack-user-map:${workspaceId}:${slackUserId}`,
        devosUserId,
        300,
      );
    });

    it('returns null when no mapping exists', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockMappingRepo.findOne.mockResolvedValue(null);

      const result = await service.findDevosUserBySlackId(workspaceId, slackUserId);

      expect(result).toBeNull();
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `slack-user-map:${workspaceId}:${slackUserId}`,
        'null',
        300,
      );
    });

    it('returns null when cached value is "null"', async () => {
      mockRedisService.get.mockResolvedValue('null');

      const result = await service.findDevosUserBySlackId(workspaceId, slackUserId);

      expect(result).toBeNull();
    });
  });
});
