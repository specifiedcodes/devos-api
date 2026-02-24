/**
 * SlackEventsController Tests
 * Story 21.1: Slack OAuth Integration (AC3)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { SlackEventsController } from '../controllers/slack-events.controller';
import { SlackOAuthService } from '../../../notifications/services/slack-oauth.service';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { RedisService } from '../../../redis/redis.service';

describe('SlackEventsController', () => {
  let controller: SlackEventsController;
  let mockOAuthService: any;
  let mockIntegrationRepo: any;
  let mockRedisService: any;
  let mockConfigService: any;

  const validSignature = 'v0=abc123';
  const validTimestamp = String(Math.floor(Date.now() / 1000));

  beforeEach(async () => {
    mockOAuthService = {
      verifySignature: jest.fn().mockReturnValue(true),
    };

    mockIntegrationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'integration-id',
        workspaceId: 'workspace-id',
        teamId: 'T12345',
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockRedisService = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SLACK_SIGNING_SECRET') return 'test-signing-secret';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlackEventsController],
      providers: [
        { provide: SlackOAuthService, useValue: mockOAuthService },
        { provide: getRepositoryToken(SlackIntegration), useValue: mockIntegrationRepo },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<SlackEventsController>(SlackEventsController);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('handleEvent', () => {
    it('responds with challenge for url_verification type', async () => {
      const body = { type: 'url_verification', challenge: 'test-challenge-token' };

      const result = await controller.handleEvent(
        validSignature,
        validTimestamp,
        body,
        { rawBody: Buffer.from(JSON.stringify(body)) },
      );

      expect(result).toEqual({ challenge: 'test-challenge-token' });
    });

    it('returns 401 for invalid Slack signature', async () => {
      mockOAuthService.verifySignature.mockReturnValue(false);

      await expect(
        controller.handleEvent('invalid', validTimestamp, {}, { rawBody: Buffer.from('{}') }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns 401 for missing signature', async () => {
      await expect(
        controller.handleEvent('', validTimestamp, {}, { rawBody: Buffer.from('{}') }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('sets integration status to disconnected on app_uninstalled', async () => {
      const body = {
        type: 'event_callback',
        team_id: 'T12345',
        event: { type: 'app_uninstalled' },
      };

      await controller.handleEvent(
        validSignature,
        validTimestamp,
        body,
        { rawBody: Buffer.from(JSON.stringify(body)) },
      );

      expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
        { id: 'integration-id' },
        { status: 'disconnected' },
      );
      expect(mockRedisService.del).toHaveBeenCalledWith('slack-integration:workspace-id');
    });

    it('sets integration status to revoked on tokens_revoked', async () => {
      const body = {
        type: 'event_callback',
        team_id: 'T12345',
        event: { type: 'tokens_revoked' },
      };

      await controller.handleEvent(
        validSignature,
        validTimestamp,
        body,
        { rawBody: Buffer.from(JSON.stringify(body)) },
      );

      expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
        { id: 'integration-id' },
        { status: 'revoked' },
      );
    });

    it('returns 200 for unhandled event types', async () => {
      const body = {
        type: 'event_callback',
        team_id: 'T12345',
        event: { type: 'some_other_event' },
      };

      const result = await controller.handleEvent(
        validSignature,
        validTimestamp,
        body,
        { rawBody: Buffer.from(JSON.stringify(body)) },
      );

      expect(result).toEqual({ ok: true });
    });

    it('returns 503 when SLACK_SIGNING_SECRET is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      // Re-create controller with missing signing secret
      const module: TestingModule = await Test.createTestingModule({
        controllers: [SlackEventsController],
        providers: [
          { provide: SlackOAuthService, useValue: mockOAuthService },
          { provide: getRepositoryToken(SlackIntegration), useValue: mockIntegrationRepo },
          { provide: RedisService, useValue: mockRedisService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const unconfiguredController = module.get<SlackEventsController>(SlackEventsController);

      await expect(
        unconfiguredController.handleEvent(validSignature, validTimestamp, {}, {}),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('handleInteraction', () => {
    it('returns 401 for invalid signature', async () => {
      mockOAuthService.verifySignature.mockReturnValue(false);

      await expect(
        controller.handleInteraction('invalid', validTimestamp, {}, { rawBody: Buffer.from('{}') }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('parses URL-encoded payload correctly', async () => {
      const payload = JSON.stringify({ type: 'block_actions', team: { id: 'T12345' } });
      const body = { payload };

      const result = await controller.handleInteraction(
        validSignature,
        validTimestamp,
        body,
        { rawBody: Buffer.from(`payload=${encodeURIComponent(payload)}`) },
      );

      expect(result).toEqual({ ok: true });
    });

    it('acknowledges within 3 seconds (returns immediately)', async () => {
      const body = { type: 'block_actions', team: { id: 'T12345' } };

      const start = Date.now();
      const result = await controller.handleInteraction(
        validSignature,
        validTimestamp,
        body,
        { rawBody: Buffer.from(JSON.stringify(body)) },
      );
      const elapsed = Date.now() - start;

      expect(result).toEqual({ ok: true });
      expect(elapsed).toBeLessThan(3000);
    });

    it('returns 503 when signing secret not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        controllers: [SlackEventsController],
        providers: [
          { provide: SlackOAuthService, useValue: mockOAuthService },
          { provide: getRepositoryToken(SlackIntegration), useValue: mockIntegrationRepo },
          { provide: RedisService, useValue: mockRedisService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const unconfiguredController = module.get<SlackEventsController>(SlackEventsController);

      await expect(
        unconfiguredController.handleInteraction(validSignature, validTimestamp, {}, {}),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
