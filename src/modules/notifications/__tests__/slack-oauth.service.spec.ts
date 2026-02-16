/**
 * SlackOAuthService Tests
 * Story 16.4: Slack Notification Integration (AC4)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { SlackOAuthService } from '../services/slack-oauth.service';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { RedisService } from '../../redis/redis.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('SlackOAuthService', () => {
  let service: SlackOAuthService;
  let repo: any;
  let configService: any;
  let encryptionService: any;
  let redisService: any;

  const mockConfig: Record<string, string> = {
    SLACK_CLIENT_ID: 'test-client-id',
    SLACK_CLIENT_SECRET: 'test-client-secret',
    SLACK_SIGNING_SECRET: 'test-signing-secret',
    FRONTEND_URL: 'https://app.devos.io',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    repo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({ id: 'int-1', ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'int-1', ...data })),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => mockConfig[key] || defaultValue || undefined),
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue('encrypted-iv:encrypted-tag:encrypted-data'),
      decrypt: jest.fn().mockReturnValue('xoxb-decrypted-token'),
    };

    redisService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackOAuthService,
        { provide: getRepositoryToken(SlackIntegration), useValue: repo },
        { provide: ConfigService, useValue: configService },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<SlackOAuthService>(SlackOAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAuthorizationUrl', () => {
    it('should return valid Slack OAuth URL with correct parameters', async () => {
      const url = await service.getAuthorizationUrl('ws-1', 'user-1');

      expect(url).toContain('https://slack.com/oauth/v2/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('state=');
    });

    it('should store state in Redis with 10-minute TTL', async () => {
      await service.getAuthorizationUrl('ws-1', 'user-1');

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('slack-oauth-state:'),
        expect.stringContaining('"workspaceId":"ws-1"'),
        600,
      );
    });

    it('should include required scopes in URL', async () => {
      const url = await service.getAuthorizationUrl('ws-1', 'user-1');

      expect(url).toContain('chat%3Awrite');
      expect(url).toContain('channels%3Aread');
      expect(url).toContain('groups%3Aread');
      expect(url).toContain('incoming-webhook');
    });

    it('should throw BadRequestException when SLACK_CLIENT_ID is not configured', async () => {
      // Create a service with missing client ID
      const noConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackOAuthService,
          { provide: getRepositoryToken(SlackIntegration), useValue: repo },
          { provide: ConfigService, useValue: noConfigService },
          { provide: EncryptionService, useValue: encryptionService },
          { provide: RedisService, useValue: redisService },
        ],
      }).compile();

      const noConfigOAuthService = module.get<SlackOAuthService>(SlackOAuthService);
      await expect(noConfigOAuthService.getAuthorizationUrl('ws-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleCallback', () => {
    const validState = 'valid-state-hex';
    const validCode = 'slack-auth-code';

    beforeEach(() => {
      redisService.get.mockResolvedValue(JSON.stringify({ workspaceId: 'ws-1', userId: 'user-1' }));

      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ok: true,
          access_token: 'xoxb-test-token',
          team: { id: 'T12345', name: 'Test Team' },
          bot_user_id: 'U12345',
          incoming_webhook: { url: 'https://hooks.slack.com/...', channel: '#general', channel_id: 'C12345' },
          scope: 'chat:write,channels:read,groups:read,incoming-webhook',
        }),
      });

      repo.findOne.mockResolvedValue(null);
    });

    it('should validate state parameter from Redis', async () => {
      await service.handleCallback(validCode, validState);

      expect(redisService.get).toHaveBeenCalledWith(`slack-oauth-state:${validState}`);
    });

    it('should reject invalid/expired state', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(service.handleCallback(validCode, 'invalid-state')).rejects.toThrow(BadRequestException);
    });

    it('should exchange code for token via Slack API', async () => {
      await service.handleCallback(validCode, validState);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/oauth.v2.access',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('code=slack-auth-code'),
        }),
      );
    });

    it('should encrypt bot token before storing', async () => {
      await service.handleCallback(validCode, validState);

      expect(encryptionService.encrypt).toHaveBeenCalledWith('xoxb-test-token');
    });

    it('should create new SlackIntegration record on first connect', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.handleCallback(validCode, validState);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          teamId: 'T12345',
          teamName: 'Test Team',
          botToken: 'encrypted-iv:encrypted-tag:encrypted-data',
          status: 'active',
        }),
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('should update existing SlackIntegration record on reconnect (upsert)', async () => {
      const existing = {
        id: 'existing-id',
        workspaceId: 'ws-1',
        teamId: 'T_OLD',
        botToken: 'old-encrypted',
        botTokenIV: 'old-iv',
        status: 'revoked',
      };
      repo.findOne.mockResolvedValue(existing);

      await service.handleCallback(validCode, validState);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-id',
          teamId: 'T12345',
          status: 'active',
        }),
      );
    });

    it('should delete state from Redis after successful exchange', async () => {
      await service.handleCallback(validCode, validState);

      expect(redisService.del).toHaveBeenCalledWith(`slack-oauth-state:${validState}`);
    });

    it('should throw on invalid code (Slack API returns error)', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ ok: false, error: 'invalid_code' }),
      });

      await expect(service.handleCallback('bad-code', validState)).rejects.toThrow(BadRequestException);
    });

    it('should return workspaceId and teamName on success', async () => {
      const result = await service.handleCallback(validCode, validState);

      expect(result).toEqual({
        workspaceId: 'ws-1',
        teamName: 'Test Team',
      });
    });
  });

  describe('verifySignature', () => {
    const signingSecret = 'test-signing-secret';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = 'test-request-body';

    function computeValidSignature(ts: string, b: string): string {
      const sigBasestring = `v0:${ts}:${b}`;
      const hmac = crypto.createHmac('sha256', signingSecret);
      hmac.update(sigBasestring);
      return `v0=${hmac.digest('hex')}`;
    }

    it('should accept valid signature with correct signing secret', () => {
      const signature = computeValidSignature(timestamp, body);
      expect(service.verifySignature(signature, timestamp, body)).toBe(true);
    });

    it('should reject invalid signature', () => {
      expect(service.verifySignature('v0=invalid-hash', timestamp, body)).toBe(false);
    });

    it('should reject request with timestamp >5 minutes old', () => {
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400);
      const signature = computeValidSignature(oldTimestamp, body);
      expect(service.verifySignature(signature, oldTimestamp, body)).toBe(false);
    });

    it('should use timing-safe comparison', () => {
      // Test that it doesn't crash with different length signatures
      expect(service.verifySignature('short', timestamp, body)).toBe(false);
      expect(service.verifySignature('v0=' + 'a'.repeat(64), timestamp, body)).toBe(false);
    });
  });
});
