/**
 * SlackInteractionHandlerService Tests
 * Story 21.2: Slack Interactive Components (AC14.1)
 *
 * Comprehensive tests for interaction handling: block actions, view submissions,
 * slash commands, deduplication, permission checks, and logging.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SlackInteractionHandlerService } from '../services/slack-interaction-handler.service';
import { SlackUserMappingService } from '../services/slack-user-mapping.service';
import { SlackNotificationService } from '../../../notifications/services/slack-notification.service';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import { SlackIntegration } from '../../../../database/entities/slack-integration.entity';
import { SlackInteractionLog } from '../../../../database/entities/slack-interaction-log.entity';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('SlackInteractionHandlerService', () => {
  let service: SlackInteractionHandlerService;
  let mockUserMappingService: any;
  let mockSlackNotificationService: any;
  let mockEncryptionService: any;
  let mockRedisService: any;
  let mockIntegrationRepo: any;
  let mockInteractionLogRepo: any;

  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const integrationId = '22222222-2222-2222-2222-222222222222';
  const devosUserId = '33333333-3333-3333-3333-333333333333';
  const slackUserId = 'U12345ABC';
  const teamId = 'T12345';
  const deploymentId = '44444444-4444-4444-4444-444444444444';

  const mockIntegration: Partial<SlackIntegration> = {
    id: integrationId,
    workspaceId,
    teamId,
    teamName: 'Test Team',
    botToken: 'encrypted-token',
    status: 'active',
    messageCount: 10,
    defaultChannelId: 'C12345',
  };

  beforeEach(async () => {
    mockFetch.mockReset();

    mockUserMappingService = {
      findDevosUserBySlackId: jest.fn().mockResolvedValue(devosUserId),
    };

    mockSlackNotificationService = {
      getIntegration: jest.fn().mockResolvedValue(mockIntegration),
    };

    mockEncryptionService = {
      decrypt: jest.fn().mockReturnValue('xoxb-test-token'),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockIntegrationRepo = {
      findOne: jest.fn().mockResolvedValue(mockIntegration),
    };

    mockInteractionLogRepo = {
      create: jest.fn((data: any) => ({ id: 'log-id', ...data })),
      save: jest.fn((data: any) => Promise.resolve({ id: 'log-id', ...data })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackInteractionHandlerService,
        { provide: SlackUserMappingService, useValue: mockUserMappingService },
        { provide: SlackNotificationService, useValue: mockSlackNotificationService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getRepositoryToken(SlackIntegration), useValue: mockIntegrationRepo },
        { provide: getRepositoryToken(SlackInteractionLog), useValue: mockInteractionLogRepo },
      ],
    }).compile();

    service = module.get<SlackInteractionHandlerService>(SlackInteractionHandlerService);
  });

  // ==================== handleBlockActions ====================

  describe('handleBlockActions', () => {
    const basePayload = {
      type: 'block_actions',
      team: { id: teamId },
      user: { id: slackUserId },
      trigger_id: 'trigger-123',
      response_url: 'https://hooks.slack.com/actions/T12345/response',
      actions: [
        { action_id: `approve_deploy:${deploymentId}`, value: deploymentId },
      ],
    };

    it('should handle approve_deploy action successfully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await service.handleBlockActions(basePayload);

      expect(mockUserMappingService.findDevosUserBySlackId).toHaveBeenCalledWith(workspaceId, slackUserId);
      expect(mockInteractionLogRepo.save).toHaveBeenCalled();
      const savedLog = mockInteractionLogRepo.create.mock.calls[0][0];
      expect(savedLog.resultStatus).toBe('success');
      expect(savedLog.actionId).toContain('approve_deploy');
    });

    it('should handle reject_deploy action successfully', async () => {
      const rejectPayload = {
        ...basePayload,
        actions: [{ action_id: `reject_deploy:${deploymentId}`, value: deploymentId }],
      };
      mockFetch.mockResolvedValueOnce({ ok: true });

      await service.handleBlockActions(rejectPayload);

      const savedLog = mockInteractionLogRepo.create.mock.calls[0][0];
      expect(savedLog.resultStatus).toBe('success');
      expect(savedLog.actionId).toContain('reject_deploy');
    });

    it('should return ephemeral error when Slack user is not mapped', async () => {
      mockUserMappingService.findDevosUserBySlackId.mockResolvedValue(null);
      mockFetch.mockResolvedValueOnce({ ok: true });

      await service.handleBlockActions(basePayload);

      expect(mockFetch).toHaveBeenCalledWith(
        basePayload.response_url,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('link your DevOS account'),
        }),
      );
      const savedLog = mockInteractionLogRepo.create.mock.calls[0][0];
      expect(savedLog.resultStatus).toBe('unauthorized');
    });

    it('should handle respond_agent action by opening modal', async () => {
      const agentId = 'agent-123';
      const conversationId = 'conv-456';
      const respondPayload = {
        ...basePayload,
        actions: [{ action_id: `respond_agent:${agentId}:${conversationId}` }],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await service.handleBlockActions(respondPayload);

      expect(mockEncryptionService.decrypt).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/views.open',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('agent_response'),
        }),
      );
    });

    it('should skip invalid payload with missing team or user', async () => {
      await service.handleBlockActions({ type: 'block_actions', actions: [] });

      expect(mockIntegrationRepo.findOne).not.toHaveBeenCalled();
      expect(mockInteractionLogRepo.save).not.toHaveBeenCalled();
    });

    it('should skip when no integration found for team', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);

      await service.handleBlockActions(basePayload);

      expect(mockUserMappingService.findDevosUserBySlackId).not.toHaveBeenCalled();
    });

    it('should log interaction even when updateOriginalMessage fails', async () => {
      // The main action succeeds but the message update fails
      // Since updateOriginalMessage catches its own errors, the action still logs as success
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await service.handleBlockActions(basePayload);

      expect(mockInteractionLogRepo.save).toHaveBeenCalled();
      // The action itself succeeded, only the message update failed
      const savedLog = mockInteractionLogRepo.create.mock.calls[0][0];
      expect(savedLog.resultStatus).toBe('success');
      expect(savedLog.interactionType).toBe('block_actions');
    });

    it('should handle multiple actions in a single payload', async () => {
      const multiActionPayload = {
        ...basePayload,
        actions: [
          { action_id: `approve_deploy:${deploymentId}`, value: deploymentId },
          { action_id: 'view_deployment', value: '' },
        ],
      };
      mockFetch.mockResolvedValue({ ok: true });

      await service.handleBlockActions(multiActionPayload);

      expect(mockInteractionLogRepo.save).toHaveBeenCalledTimes(2);
    });

    it('should include response time in interaction log', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await service.handleBlockActions(basePayload);

      const savedLog = mockInteractionLogRepo.create.mock.calls[0][0];
      expect(savedLog.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should update original message for deploy approve action', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await service.handleBlockActions(basePayload);

      expect(mockFetch).toHaveBeenCalledWith(
        basePayload.response_url,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('approved'),
        }),
      );
    });

    it('should update original message for deploy reject action', async () => {
      const rejectPayload = {
        ...basePayload,
        actions: [{ action_id: `reject_deploy:${deploymentId}`, value: deploymentId }],
      };
      mockFetch.mockResolvedValueOnce({ ok: true });

      await service.handleBlockActions(rejectPayload);

      expect(mockFetch).toHaveBeenCalledWith(
        rejectPayload.response_url,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('rejected'),
        }),
      );
    });
  });

  // ==================== handleViewSubmission ====================

  describe('handleViewSubmission', () => {
    const viewPayload = {
      type: 'view_submission',
      team: { id: teamId },
      user: { id: slackUserId },
      view: {
        callback_id: 'agent_response:agent-123:conv-456',
        state: {
          values: {
            response_block: {
              response_input: { value: 'This is my response' },
            },
          },
        },
      },
    };

    it('should handle agent response modal submission', async () => {
      await service.handleViewSubmission(viewPayload);

      expect(mockIntegrationRepo.findOne).toHaveBeenCalledWith({ where: { teamId } });
      expect(mockInteractionLogRepo.save).toHaveBeenCalled();
      const savedLog = mockInteractionLogRepo.create.mock.calls[0][0];
      expect(savedLog.resultStatus).toBe('success');
      expect(savedLog.interactionType).toBe('view_submission');
    });

    it('should skip when team or user is missing', async () => {
      await service.handleViewSubmission({ type: 'view_submission' });

      expect(mockIntegrationRepo.findOne).not.toHaveBeenCalled();
    });

    it('should skip when no integration found', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);

      await service.handleViewSubmission(viewPayload);

      expect(mockInteractionLogRepo.save).not.toHaveBeenCalled();
    });

    it('should handle unknown callback_id types', async () => {
      const unknownPayload = {
        ...viewPayload,
        view: { ...viewPayload.view, callback_id: 'unknown_type:data' },
      };

      await service.handleViewSubmission(unknownPayload);

      const savedLog = mockInteractionLogRepo.create.mock.calls[0][0];
      expect(savedLog.resultStatus).toBe('success');
    });
  });

  // ==================== handleSlashCommand ====================

  describe('handleSlashCommand', () => {
    const baseCommand = {
      command: '/devos',
      text: 'status',
      team_id: teamId,
      user_id: slackUserId,
      trigger_id: 'trigger-456',
      response_url: 'https://hooks.slack.com/commands/response',
    };

    it('should handle /devos status command', async () => {
      const result = await service.handleSlashCommand(baseCommand);

      expect(result).toHaveProperty('response_type', 'ephemeral');
      expect(result.text).toContain('DevOS Project Status');
      expect(mockInteractionLogRepo.save).toHaveBeenCalled();
    });

    it('should handle /devos agents command', async () => {
      const result = await service.handleSlashCommand({ ...baseCommand, text: 'agents' });

      expect(result.response_type).toBe('ephemeral');
      expect(result.text).toContain('Active Agents');
    });

    it('should handle /devos deploy staging with mapped user', async () => {
      const result = await service.handleSlashCommand({ ...baseCommand, text: 'deploy staging' });

      expect(result.response_type).toBe('ephemeral');
      expect(result.text).toContain('staging');
      expect(result.text).toContain('submitted');
    });

    it('should reject /devos deploy when user not mapped', async () => {
      mockUserMappingService.findDevosUserBySlackId.mockResolvedValue(null);

      const result = await service.handleSlashCommand({ ...baseCommand, text: 'deploy staging' });

      expect(result.text).toContain('link your DevOS account');
      const savedLog = mockInteractionLogRepo.create.mock.calls[0][0];
      expect(savedLog.resultStatus).toBe('unauthorized');
    });

    it('should handle /devos help command', async () => {
      const result = await service.handleSlashCommand({ ...baseCommand, text: 'help' });

      expect(result.response_type).toBe('ephemeral');
      expect(result.text).toContain('/devos status');
      expect(result.text).toContain('/devos agents');
      expect(result.text).toContain('/devos deploy');
      expect(result.text).toContain('/devos help');
    });

    it('should handle unknown subcommand', async () => {
      const result = await service.handleSlashCommand({ ...baseCommand, text: 'foobar' });

      expect(result.text).toContain('Unknown command');
      expect(result.text).toContain('foobar');
    });

    it('should handle empty text', async () => {
      const result = await service.handleSlashCommand({ ...baseCommand, text: '' });

      expect(result.text).toContain('Unknown command');
    });

    it('should return error for invalid request', async () => {
      const result = await service.handleSlashCommand({});

      expect(result.text).toContain('Invalid');
    });

    it('should log slash command interactions', async () => {
      await service.handleSlashCommand(baseCommand);

      expect(mockInteractionLogRepo.save).toHaveBeenCalled();
      const savedLog = mockInteractionLogRepo.create.mock.calls[0][0];
      expect(savedLog.interactionType).toBe('slash_command');
      expect(savedLog.actionId).toBe('/devos status');
    });

    it('should return no integration error when team not found', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);

      const result = await service.handleSlashCommand(baseCommand);

      expect(result.text).toContain('No DevOS integration');
    });
  });

  // ==================== updateOriginalMessage ====================

  describe('updateOriginalMessage', () => {
    it('should POST updated message to response_url', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const url = 'https://hooks.slack.com/actions/T12345/response';
      const message = { text: 'Updated', replace_original: true };

      await service.updateOriginalMessage(url, message);

      expect(mockFetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        }),
      );
    });

    it('should handle timeout (AbortError)', async () => {
      mockFetch.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

      // Should not throw
      await expect(
        service.updateOriginalMessage('https://hooks.slack.com/test', { text: 'test' }),
      ).resolves.toBeUndefined();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        service.updateOriginalMessage('https://hooks.slack.com/test', { text: 'test' }),
      ).resolves.toBeUndefined();
    });

    it('should handle non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });

      await expect(
        service.updateOriginalMessage('https://hooks.slack.com/test', { text: 'test' }),
      ).resolves.toBeUndefined();
    });
  });

  // ==================== openModal ====================

  describe('openModal', () => {
    it('should call views.open API with correct payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await service.openModal('trigger-123', mockIntegration as SlackIntegration, 'agent-1', 'conv-1');

      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith(mockIntegration.botToken);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/views.open',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer xoxb-test-token',
          }),
        }),
      );

      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.trigger_id).toBe('trigger-123');
      expect(fetchBody.view.callback_id).toBe('agent_response:agent-1:conv-1');
      expect(fetchBody.view.type).toBe('modal');
    });

    it('should handle decryption failure', async () => {
      mockEncryptionService.decrypt.mockImplementation(() => { throw new Error('Decrypt failed'); });

      await expect(
        service.openModal('trigger-123', mockIntegration as SlackIntegration, 'agent-1', 'conv-1'),
      ).resolves.toBeUndefined();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle views.open API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: false, error: 'expired_trigger_id' }),
      });

      await expect(
        service.openModal('trigger-123', mockIntegration as SlackIntegration, 'agent-1', 'conv-1'),
      ).resolves.toBeUndefined();
    });
  });

  // ==================== buildEphemeralResponse ====================

  describe('buildEphemeralResponse', () => {
    it('should return ephemeral response object', () => {
      const result = service.buildEphemeralResponse('Test message');

      expect(result).toEqual({
        response_type: 'ephemeral',
        text: 'Test message',
      });
    });
  });

  // ==================== Interaction Logging ====================

  describe('interaction logging', () => {
    it('should log successful interaction with all fields', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await service.handleBlockActions({
        type: 'block_actions',
        team: { id: teamId },
        user: { id: slackUserId },
        trigger_id: 'trigger-123',
        response_url: 'https://hooks.slack.com/test',
        actions: [{ action_id: `approve_deploy:${deploymentId}` }],
      });

      expect(mockInteractionLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          slackIntegrationId: integrationId,
          slackUserId,
          devosUserId,
          interactionType: 'block_actions',
          resultStatus: 'success',
        }),
      );
    });

    it('should sanitize payload before logging (remove sensitive keys)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await service.handleBlockActions({
        type: 'block_actions',
        team: { id: teamId },
        user: { id: slackUserId },
        trigger_id: 'trigger-123',
        response_url: 'https://hooks.slack.com/test',
        token: 'sensitive-token',
        actions: [{ action_id: `approve_deploy:${deploymentId}` }],
      });

      const savedPayload = mockInteractionLogRepo.create.mock.calls[0][0].payload;
      expect(savedPayload.token).toBe('[REDACTED]');
    });

    it('should not throw when log save fails', async () => {
      mockInteractionLogRepo.save.mockRejectedValueOnce(new Error('DB error'));
      mockFetch.mockResolvedValueOnce({ ok: true });

      // Should not throw
      await expect(
        service.handleBlockActions({
          type: 'block_actions',
          team: { id: teamId },
          user: { id: slackUserId },
          trigger_id: 'trigger-123',
          response_url: 'https://hooks.slack.com/test',
          actions: [{ action_id: `approve_deploy:${deploymentId}` }],
        }),
      ).resolves.toBeUndefined();
    });
  });
});
