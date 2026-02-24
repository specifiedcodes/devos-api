/**
 * JiraApiClientService Tests
 * Story 21.6: Jira Two-Way Sync (AC2)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  JiraApiClientService,
  JiraApiError,
  RateLimitError,
} from '../services/jira-api-client.service';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('JiraApiClientService', () => {
  let service: JiraApiClientService;

  const mockEncryptionService = {
    encrypt: jest.fn().mockReturnValue({ encrypted: 'enc', iv: 'iv' }),
    decrypt: jest.fn().mockReturnValue('decrypted-token'),
  };

  const mockRedisService = {
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    zcard: jest.fn().mockResolvedValue(0),
    zadd: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    setnx: jest.fn().mockResolvedValue('OK'),
  };

  const mockIntegrationRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
  };

  const mockIntegration: Partial<JiraIntegration> = {
    id: 'int-1',
    workspaceId: 'ws-1',
    cloudId: 'cloud-123',
    accessToken: 'enc-access',
    accessTokenIv: 'access-iv',
    refreshToken: 'enc-refresh',
    refreshTokenIv: 'refresh-iv',
    tokenExpiresAt: new Date(Date.now() + 3600000),
    jiraProjectKey: 'PROJ',
    jiraSiteUrl: 'https://test.atlassian.net',
    issueType: 'Story',
    statusMapping: { backlog: 'To Do', in_progress: 'In Progress', review: 'In Review', done: 'Done' },
    fieldMapping: { title: 'summary', description: 'description' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JiraApiClientService,
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getRepositoryToken(JiraIntegration), useValue: mockIntegrationRepo },
      ],
    }).compile();

    service = module.get<JiraApiClientService>(JiraApiClientService);
  });

  describe('request', () => {
    it('sends correct REST request with Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ accountId: '123' }),
        headers: new Map(),
      });

      await service.request(mockIntegration as JiraIntegration, 'GET', '/myself');

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/myself`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer decrypted-token',
          }),
        }),
      );
    });

    it('decrypts access token via EncryptionService before use', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Map(),
      });

      await service.request(mockIntegration as JiraIntegration, 'GET', '/myself');

      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('enc-access', 'access-iv');
    });

    it('handles 401 by attempting token refresh', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 401, ok: false, headers: new Map() })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ accountId: '123' }),
          headers: new Map(),
        });

      mockIntegrationRepo.findOne.mockResolvedValue(null);

      const result = await service.request(mockIntegration as JiraIntegration, 'GET', '/myself');
      expect(result).toEqual({ accountId: '123' });
    });

    it('handles 429 response with RateLimitError', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: new Map([['retry-after', '30']]),
      });

      await expect(
        service.request(mockIntegration as JiraIntegration, 'GET', '/myself'),
      ).rejects.toThrow(RateLimitError);
    });

    it('handles 403 with JiraApiError', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 403,
        ok: false,
        headers: new Map(),
      });

      await expect(
        service.request(mockIntegration as JiraIntegration, 'GET', '/myself'),
      ).rejects.toThrow(JiraApiError);
    });

    it('retries on 5xx up to 3 times', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 500, ok: false, headers: new Map() })
        .mockResolvedValueOnce({ status: 500, ok: false, headers: new Map() })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ data: 'ok' }),
          headers: new Map(),
        });

      const result = await service.request(mockIntegration as JiraIntegration, 'GET', '/test');
      expect(result).toEqual({ data: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 15000);

    it('respects rate limit (rejects when at limit)', async () => {
      mockRedisService.zcard.mockResolvedValueOnce(90);

      await expect(
        service.request(mockIntegration as JiraIntegration, 'GET', '/myself'),
      ).rejects.toThrow(RateLimitError);
    });

    it('adds rate limit entry to Redis after successful call', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({}),
        headers: new Map(),
      });

      await service.request(mockIntegration as JiraIntegration, 'GET', '/myself');

      expect(mockRedisService.zadd).toHaveBeenCalled();
    });

    it('handles 204 response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 204,
        ok: true,
        headers: new Map(),
      });

      const result = await service.request(mockIntegration as JiraIntegration, 'PUT', '/issue/PROJ-1');
      expect(result).toBeUndefined();
    });
  });

  describe('getAccessibleSites', () => {
    it('returns Atlassian Cloud site list', async () => {
      const sites = [{ id: 'site-1', url: 'https://test.atlassian.net', name: 'Test' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sites),
      });

      const result = await service.getAccessibleSites('enc-token', 'iv');
      expect(result).toEqual(sites);
    });
  });

  describe('getProjects', () => {
    it('returns project list for a Jira site', async () => {
      const projects = [{ id: '1', key: 'PROJ', name: 'My Project', projectTypeKey: 'software' }];
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ values: projects }),
        headers: new Map(),
      });

      const result = await service.getProjects(mockIntegration as JiraIntegration);
      expect(result).toEqual(projects);
    });
  });

  describe('createIssue', () => {
    it('sends correct REST request with ADF description', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ id: '10001', key: 'PROJ-1', self: 'https://...' }),
        headers: new Map(),
      });

      const adf = JSON.stringify({ version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test' }] }] });

      const result = await service.createIssue(mockIntegration as JiraIntegration, {
        projectKey: 'PROJ',
        issueType: 'Story',
        summary: 'Test Issue',
        description: adf,
      });

      expect(result).toEqual({ id: '10001', key: 'PROJ-1', self: 'https://...' });
    });
  });

  describe('getIssueTransitions', () => {
    it('returns available transitions for an issue', async () => {
      const transitions = [{ id: '11', name: 'Start', to: { id: '3', name: 'In Progress' } }];
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ transitions }),
        headers: new Map(),
      });

      const result = await service.getIssueTransitions(mockIntegration as JiraIntegration, 'PROJ-1');
      expect(result).toEqual(transitions);
    });
  });

  describe('verifyToken', () => {
    it('returns valid:true for working token', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ accountId: 'acc-1', emailAddress: 'test@test.com', displayName: 'Test User' }),
        headers: new Map(),
      });

      const result = await service.verifyToken(mockIntegration as JiraIntegration);
      expect(result.valid).toBe(true);
      expect(result.accountId).toBe('acc-1');
    });

    it('returns valid:false with error for expired token', async () => {
      mockFetch.mockResolvedValueOnce({ status: 401, ok: false, headers: new Map() });
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ access_token: 'new', refresh_token: 'new', expires_in: 3600 }),
      });
      mockFetch.mockResolvedValueOnce({ status: 401, ok: false, headers: new Map() });

      const result = await service.verifyToken(mockIntegration as JiraIntegration);
      expect(result.valid).toBe(false);
    });
  });

  describe('refreshAccessToken', () => {
    it('exchanges refresh token for new access token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });

      const result = await service.refreshAccessToken(mockIntegration as JiraIntegration);
      expect(result.accessToken).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('encrypts new tokens before storage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });

      await service.refreshAccessToken(mockIntegration as JiraIntegration);
      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('new-access');
      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('new-refresh');
    });

    it('updates integration record with new expiry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });

      await service.refreshAccessToken(mockIntegration as JiraIntegration);
      expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
        'int-1',
        expect.objectContaining({
          accessToken: 'enc',
          accessTokenIv: 'iv',
        }),
      );
    });

    it('uses distributed lock to prevent concurrent refreshes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new',
          refresh_token: 'new',
          expires_in: 3600,
        }),
      });

      await service.refreshAccessToken(mockIntegration as JiraIntegration);
      expect(mockRedisService.setnx).toHaveBeenCalledWith(
        `jira-token-refresh:int-1`,
        'locked',
        30,
      );
    });
  });

  describe('addComment', () => {
    it('sends POST with ADF comment body', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ id: 'comment-1' }),
        headers: new Map(),
      });

      const result = await service.addComment(mockIntegration as JiraIntegration, 'PROJ-1', 'Test comment');
      expect(result).toEqual({ id: 'comment-1' });
    });
  });

  describe('getIssue', () => {
    it('returns issue data', async () => {
      const issue = { id: '10001', key: 'PROJ-1', self: 'url', fields: { summary: 'Test', status: { id: '1', name: 'To Do', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } };
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve(issue),
        headers: new Map(),
      });

      const result = await service.getIssue(mockIntegration as JiraIntegration, 'PROJ-1');
      expect(result).toEqual(issue);
    });

    it('returns null for not found', async () => {
      mockFetch.mockResolvedValueOnce({ status: 404, ok: false, headers: new Map() });
      mockFetch.mockResolvedValueOnce({ status: 404, ok: false, headers: new Map() });
      mockFetch.mockResolvedValueOnce({ status: 404, ok: false, headers: new Map() });

      const result = await service.getIssue(mockIntegration as JiraIntegration, 'PROJ-999');
      expect(result).toBeNull();
    }, 15000);
  });

  describe('never logs tokens', () => {
    it('does not log access token or refresh token in any error path', async () => {
      const logSpy = jest.spyOn(service['logger'], 'warn');
      const errorSpy = jest.spyOn(service['logger'], 'error');

      mockFetch.mockRejectedValueOnce(new Error('Network failure'));
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      try {
        await service.request(mockIntegration as JiraIntegration, 'GET', '/test');
      } catch { /* expected */ }

      for (const spy of [logSpy, errorSpy]) {
        for (const call of spy.mock.calls) {
          const message = call.join(' ');
          expect(message).not.toContain('decrypted-token');
          expect(message).not.toContain('enc-access');
          expect(message).not.toContain('enc-refresh');
        }
      }
    }, 15000);
  });
});
