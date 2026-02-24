/**
 * SlackEventsController Interaction Tests
 * Story 21.2: Slack Interactive Components (AC14.3)
 *
 * Tests for interaction routing, signature verification,
 * deduplication, and slash command endpoints.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { SlackEventsController } from '../controllers/slack-events.controller';
import { SlackOAuthService } from '../../../notifications/services/slack-oauth.service';
import { SlackInteractionHandlerService } from '../services/slack-interaction-handler.service';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { RedisService } from '../../../redis/redis.service';

describe('SlackEventsController - Interactions', () => {
  let controller: SlackEventsController;
  let mockOAuthService: any;
  let mockInteractionHandler: any;
  let mockRedisService: any;
  let mockConfigService: any;
  let mockIntegrationRepo: any;

  const teamId = 'T12345';

  beforeEach(async () => {
    mockOAuthService = {
      verifySignature: jest.fn().mockReturnValue(true),
    };

    mockInteractionHandler = {
      handleBlockActions: jest.fn().mockResolvedValue(undefined),
      handleViewSubmission: jest.fn().mockResolvedValue(undefined),
      handleSlashCommand: jest.fn().mockResolvedValue({ response_type: 'ephemeral', text: 'ok' }),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'SLACK_SIGNING_SECRET') return 'test-signing-secret';
        return undefined;
      }),
    };

    mockIntegrationRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'int-1', teamId, workspaceId: 'ws-1' }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlackEventsController],
      providers: [
        { provide: SlackOAuthService, useValue: mockOAuthService },
        { provide: SlackInteractionHandlerService, useValue: mockInteractionHandler },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(SlackIntegration), useValue: mockIntegrationRepo },
      ],
    }).compile();

    controller = module.get<SlackEventsController>(SlackEventsController);
  });

  // ==================== handleInteraction ====================

  describe('handleInteraction', () => {
    const makeReq = (body: any) => ({ rawBody: Buffer.from(JSON.stringify(body)) });

    it('should route block_actions to handler', async () => {
      const body = { payload: JSON.stringify({ type: 'block_actions', team: { id: teamId }, trigger_id: 'trig-1', actions: [] }) };
      const req = makeReq(body);

      const result = await controller.handleInteraction('sig', '12345', body, req);

      expect(result).toEqual({ ok: true });
      // Handler is called async (fire-and-forget)
      await new Promise(r => setTimeout(r, 10));
      expect(mockInteractionHandler.handleBlockActions).toHaveBeenCalled();
    });

    it('should route view_submission to handler', async () => {
      const body = { payload: JSON.stringify({ type: 'view_submission', team: { id: teamId }, trigger_id: 'trig-2' }) };
      const req = makeReq(body);

      const result = await controller.handleInteraction('sig', '12345', body, req);

      expect(result).toEqual({ ok: true });
      await new Promise(r => setTimeout(r, 10));
      expect(mockInteractionHandler.handleViewSubmission).toHaveBeenCalled();
    });

    it('should reject request with invalid signature', async () => {
      mockOAuthService.verifySignature.mockReturnValue(false);

      const body = { payload: '{}' };
      const req = makeReq(body);

      await expect(
        controller.handleInteraction('bad-sig', '12345', body, req),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ServiceUnavailableException when signing secret not configured', async () => {
      // Create controller without signing secret
      mockConfigService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        controllers: [SlackEventsController],
        providers: [
          { provide: SlackOAuthService, useValue: mockOAuthService },
          { provide: SlackInteractionHandlerService, useValue: mockInteractionHandler },
          { provide: RedisService, useValue: mockRedisService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: getRepositoryToken(SlackIntegration), useValue: mockIntegrationRepo },
        ],
      }).compile();

      const controllerNoSecret = module.get<SlackEventsController>(SlackEventsController);
      const body = { payload: '{}' };
      const req = makeReq(body);

      await expect(
        controllerNoSecret.handleInteraction('sig', '12345', body, req),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should deduplicate interactions via Redis', async () => {
      // First call - not duplicate
      mockRedisService.get.mockResolvedValueOnce(null);
      const body = { payload: JSON.stringify({ type: 'block_actions', team: { id: teamId }, trigger_id: 'same-trigger', actions: [] }) };
      const req = makeReq(body);

      await controller.handleInteraction('sig', '12345', body, req);
      expect(mockRedisService.set).toHaveBeenCalledWith('slack-interaction:same-trigger', '1', 60);

      // Second call - duplicate
      mockRedisService.get.mockResolvedValueOnce('1');
      mockInteractionHandler.handleBlockActions.mockClear();

      await controller.handleInteraction('sig', '12345', body, req);
      // Handler should NOT be called for duplicate
      await new Promise(r => setTimeout(r, 10));
      expect(mockInteractionHandler.handleBlockActions).not.toHaveBeenCalled();
    });

    it('should handle unparseable payload gracefully', async () => {
      const body = { payload: 'not-json{{{' };
      const req = makeReq(body);

      const result = await controller.handleInteraction('sig', '12345', body, req);

      expect(result).toEqual({ ok: true });
    });

    it('should handle unrecognized interaction type', async () => {
      const body = { payload: JSON.stringify({ type: 'unknown_type', team: { id: teamId }, trigger_id: 'trig-unknown' }) };
      const req = makeReq(body);

      const result = await controller.handleInteraction('sig', '12345', body, req);

      expect(result).toEqual({ ok: true });
    });
  });

  // ==================== handleSlashCommand ====================

  describe('handleSlashCommand', () => {
    const makeReq = (body: any) => ({ rawBody: Buffer.from(JSON.stringify(body)) });

    it('should route valid slash command to handler', async () => {
      const body = { command: '/devos', text: 'status', team_id: teamId, user_id: 'U123' };
      const req = makeReq(body);

      const result = await controller.handleSlashCommand('sig', '12345', body, req);

      expect(mockInteractionHandler.handleSlashCommand).toHaveBeenCalledWith(body);
      expect(result).toEqual({ response_type: 'ephemeral', text: 'ok' });
    });

    it('should reject slash command with invalid signature', async () => {
      mockOAuthService.verifySignature.mockReturnValue(false);

      const body = { command: '/devos', text: 'status', team_id: teamId, user_id: 'U123' };
      const req = makeReq(body);

      await expect(
        controller.handleSlashCommand('bad-sig', '12345', body, req),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw when signing secret not configured for slash commands', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        controllers: [SlackEventsController],
        providers: [
          { provide: SlackOAuthService, useValue: mockOAuthService },
          { provide: SlackInteractionHandlerService, useValue: mockInteractionHandler },
          { provide: RedisService, useValue: mockRedisService },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: getRepositoryToken(SlackIntegration), useValue: mockIntegrationRepo },
        ],
      }).compile();

      const ctrl = module.get<SlackEventsController>(SlackEventsController);
      const body = { command: '/devos', text: 'status' };
      const req = makeReq(body);

      await expect(
        ctrl.handleSlashCommand('sig', '12345', body, req),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
