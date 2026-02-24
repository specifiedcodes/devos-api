/**
 * SlackNotificationConfigService Tests
 * Story 21.2: Slack Interactive Components (AC14.2)
 *
 * Tests for notification config CRUD, channel resolution priority,
 * cache behavior, and edge cases.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SlackNotificationConfigService } from '../services/slack-notification-config.service';
import { SlackNotificationConfig } from '../../../../database/entities/slack-notification-config.entity';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { RedisService } from '../../../redis/redis.service';

describe('SlackNotificationConfigService', () => {
  let service: SlackNotificationConfigService;
  let mockConfigRepo: any;
  let mockIntegrationRepo: any;
  let mockRedisService: any;

  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const integrationId = '22222222-2222-2222-2222-222222222222';
  const projectId = '33333333-3333-3333-3333-333333333333';
  const configId = '44444444-4444-4444-4444-444444444444';

  const mockIntegration: Partial<SlackIntegration> = {
    id: integrationId,
    workspaceId,
    teamId: 'T12345',
    defaultChannelId: 'C_DEFAULT',
    defaultChannelName: 'general',
    eventChannelConfig: {
      deployment_failed: { channelId: 'C_ALERTS', channelName: 'alerts' },
    },
  };

  beforeEach(async () => {
    mockConfigRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: any) => ({ id: configId, ...data })),
      save: jest.fn((data: any) => Promise.resolve({ id: configId, ...data })),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    mockIntegrationRepo = {
      findOne: jest.fn().mockResolvedValue(mockIntegration),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackNotificationConfigService,
        { provide: getRepositoryToken(SlackNotificationConfig), useValue: mockConfigRepo },
        { provide: getRepositoryToken(SlackIntegration), useValue: mockIntegrationRepo },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<SlackNotificationConfigService>(SlackNotificationConfigService);
  });

  // ==================== getConfigs ====================

  describe('getConfigs', () => {
    it('should return all configs for integration', async () => {
      const configs = [
        { id: '1', slackIntegrationId: integrationId, eventType: 'epic_completed', channelId: 'C1', isEnabled: true },
        { id: '2', slackIntegrationId: integrationId, eventType: 'story_completed', channelId: 'C2', isEnabled: true },
      ];
      mockConfigRepo.find.mockResolvedValue(configs);

      const result = await service.getConfigs(integrationId);

      expect(result).toEqual(configs);
      expect(mockConfigRepo.find).toHaveBeenCalledWith({
        where: { slackIntegrationId: integrationId },
        order: { eventType: 'ASC' },
      });
    });

    it('should return empty array when no configs exist', async () => {
      const result = await service.getConfigs(integrationId);

      expect(result).toEqual([]);
    });
  });

  // ==================== upsertConfig ====================

  describe('upsertConfig', () => {
    const dto = {
      slackIntegrationId: integrationId,
      eventType: 'deployment_success',
      channelId: 'C_DEPLOY',
      channelName: 'deployments',
      isEnabled: true,
    };

    it('should create new config when none exists', async () => {
      const result = await service.upsertConfig(dto);

      expect(mockConfigRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slackIntegrationId: integrationId,
          eventType: 'deployment_success',
          channelId: 'C_DEPLOY',
          channelName: 'deployments',
          isEnabled: true,
        }),
      );
      expect(mockConfigRepo.save).toHaveBeenCalled();
      expect(result.channelId).toBe('C_DEPLOY');
    });

    it('should update existing config for same eventType + integrationId', async () => {
      const existingConfig = {
        id: configId,
        slackIntegrationId: integrationId,
        eventType: 'deployment_success',
        channelId: 'C_OLD',
        channelName: 'old-channel',
        isEnabled: false,
      };
      mockConfigRepo.findOne.mockResolvedValue(existingConfig);

      const result = await service.upsertConfig(dto);

      expect(existingConfig.channelId).toBe('C_DEPLOY');
      expect(existingConfig.channelName).toBe('deployments');
      expect(existingConfig.isEnabled).toBe(true);
      expect(mockConfigRepo.save).toHaveBeenCalledWith(existingConfig);
    });

    it('should invalidate cache after upsert', async () => {
      await service.upsertConfig(dto);

      expect(mockRedisService.del).toHaveBeenCalledWith(`slack-notif-config:${workspaceId}`);
    });

    it('should handle projectId in upsert', async () => {
      const dtoWithProject = { ...dto, projectId };

      await service.upsertConfig(dtoWithProject);

      expect(mockConfigRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId }),
      );
    });

    it('should set projectId to null when not provided', async () => {
      await service.upsertConfig(dto);

      expect(mockConfigRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: null }),
      );
    });
  });

  // ==================== deleteConfig ====================

  describe('deleteConfig', () => {
    it('should remove config and invalidate cache', async () => {
      const existingConfig = {
        id: configId,
        slackIntegrationId: integrationId,
        eventType: 'epic_completed',
      };
      mockConfigRepo.findOne.mockResolvedValue(existingConfig);

      await service.deleteConfig(configId);

      expect(mockConfigRepo.remove).toHaveBeenCalledWith(existingConfig);
      expect(mockRedisService.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException when config not found', async () => {
      await expect(service.deleteConfig('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== getChannelForEvent ====================

  describe('getChannelForEvent', () => {
    const projectSpecificConfig: Partial<SlackNotificationConfig> = {
      id: '1',
      slackIntegrationId: integrationId,
      eventType: 'deployment_success',
      projectId,
      channelId: 'C_PROJECT',
      channelName: 'project-deploys',
      isEnabled: true,
    };

    const globalConfig: Partial<SlackNotificationConfig> = {
      id: '2',
      slackIntegrationId: integrationId,
      eventType: 'deployment_success',
      projectId: null,
      channelId: 'C_GLOBAL',
      channelName: 'all-deploys',
      isEnabled: true,
    };

    it('should prioritize project-specific config over global', async () => {
      mockConfigRepo.find.mockResolvedValue([projectSpecificConfig, globalConfig]);

      const result = await service.getChannelForEvent(workspaceId, 'deployment_success', projectId);

      expect(result).toEqual({ channelId: 'C_PROJECT', channelName: 'project-deploys' });
    });

    it('should fall back to global config when no project-specific config', async () => {
      mockConfigRepo.find.mockResolvedValue([globalConfig]);

      const result = await service.getChannelForEvent(workspaceId, 'deployment_success', projectId);

      expect(result).toEqual({ channelId: 'C_GLOBAL', channelName: 'all-deploys' });
    });

    it('should fall back to eventChannelConfig when no notification config', async () => {
      mockConfigRepo.find.mockResolvedValue([]);

      const result = await service.getChannelForEvent(workspaceId, 'deployment_failed');

      expect(result).toEqual({ channelId: 'C_ALERTS', channelName: 'alerts' });
    });

    it('should fall back to defaultChannelId when no event config', async () => {
      mockConfigRepo.find.mockResolvedValue([]);

      const result = await service.getChannelForEvent(workspaceId, 'epic_completed');

      expect(result).toEqual({ channelId: 'C_DEFAULT', channelName: 'general' });
    });

    it('should skip disabled configs', async () => {
      const disabledConfig = { ...projectSpecificConfig, isEnabled: false };
      mockConfigRepo.find.mockResolvedValue([disabledConfig, globalConfig]);

      const result = await service.getChannelForEvent(workspaceId, 'deployment_success', projectId);

      expect(result).toEqual({ channelId: 'C_GLOBAL', channelName: 'all-deploys' });
    });

    it('should return null when no integration found', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);

      const result = await service.getChannelForEvent('unknown-workspace', 'epic_completed');

      expect(result).toBeNull();
    });

    it('should use cached configs on cache hit', async () => {
      const cachedConfigs = JSON.stringify([globalConfig]);
      mockRedisService.get.mockResolvedValue(cachedConfigs);

      const result = await service.getChannelForEvent(workspaceId, 'deployment_success');

      expect(result).toEqual({ channelId: 'C_GLOBAL', channelName: 'all-deploys' });
      expect(mockConfigRepo.find).not.toHaveBeenCalled();
    });

    it('should load from DB on cache miss and populate cache', async () => {
      mockConfigRepo.find.mockResolvedValue([globalConfig]);

      await service.getChannelForEvent(workspaceId, 'deployment_success');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `slack-notif-config:${workspaceId}`,
        expect.any(String),
        300,
      );
    });

    it('should handle corrupted cache gracefully', async () => {
      mockRedisService.get.mockResolvedValue('invalid-json');
      mockConfigRepo.find.mockResolvedValue([globalConfig]);

      const result = await service.getChannelForEvent(workspaceId, 'deployment_success');

      expect(result).toEqual({ channelId: 'C_GLOBAL', channelName: 'all-deploys' });
    });
  });
});
