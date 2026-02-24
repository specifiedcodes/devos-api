/**
 * LinearApiClientService Tests
 * Story 21.5: Linear Two-Way Sync (AC2)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import {
  LinearApiClientService,
  LinearApiError,
  RateLimitError,
} from '../services/linear-api-client.service';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('LinearApiClientService', () => {
  let service: LinearApiClientService;
  let encryptionService: EncryptionService;
  let redisService: RedisService;

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
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinearApiClientService,
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<LinearApiClientService>(LinearApiClientService);
    encryptionService = module.get<EncryptionService>(EncryptionService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('query', () => {
    it('sends correct GraphQL request with Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ data: { viewer: { id: '1' } } }),
        headers: new Map(),
      });

      await service.query('enc-token', 'iv', 'query { viewer { id } }');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer decrypted-token',
          }),
          body: JSON.stringify({ query: 'query { viewer { id } }', variables: undefined }),
        }),
      );
    });

    it('decrypts access token via EncryptionService before use', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ data: { test: true } }),
        headers: new Map(),
      });

      await service.query('encrypted', 'my-iv', 'query { test }');

      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('encrypted', 'my-iv');
    });

    it('handles 401 response (throws UnauthorizedException)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
        headers: new Map(),
      });

      await expect(
        service.query('enc', 'iv', 'query { viewer { id } }'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('handles 429 response with Retry-After header (throws RateLimitError)', async () => {
      const headers = new Map([['retry-after', '120']]);
      mockFetch.mockResolvedValueOnce({
        status: 429,
        ok: false,
        json: () => Promise.resolve({}),
        headers: { get: (key: string) => headers.get(key) },
      });

      await expect(
        service.query('enc', 'iv', 'query { test }'),
      ).rejects.toThrow(RateLimitError);
    });

    it('retries on 5xx up to 3 times with exponential backoff', async () => {
      const serverError = {
        status: 500,
        ok: false,
        json: () => Promise.resolve({ error: 'Server Error' }),
        headers: new Map(),
      };

      mockFetch
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce(serverError)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ data: { result: 'ok' } }),
          headers: new Map(),
        });

      const result = await service.query('enc', 'iv', 'query { test }');

      expect(result).toEqual({ result: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 30000);

    it('retries on network error up to 3 times', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ data: { result: 'ok' } }),
          headers: new Map(),
        });

      const result = await service.query('enc', 'iv', 'query { test }');

      expect(result).toEqual({ result: 'ok' });
    }, 30000);

    it('respects rate limit (rejects when at 1,500/hour)', async () => {
      mockRedisService.zcard.mockResolvedValueOnce(1500);

      await expect(
        service.query('enc', 'iv', 'query { test }', undefined, 'int-123'),
      ).rejects.toThrow(RateLimitError);
    });

    it('adds rate limit entry to Redis after successful call', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ data: { test: true } }),
        headers: new Map(),
      });

      await service.query('enc', 'iv', 'query { test }', undefined, 'int-123');

      expect(mockRedisService.zadd).toHaveBeenCalledWith(
        'linear-rate:int-123',
        expect.any(Number),
        expect.any(String),
      );
    });

    it('prunes expired rate limit entries', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ data: { test: true } }),
        headers: new Map(),
      });

      await service.query('enc', 'iv', 'query { test }', undefined, 'int-123');

      expect(mockRedisService.zremrangebyscore).toHaveBeenCalledWith(
        'linear-rate:int-123',
        0,
        expect.any(Number),
      );
    });
  });

  describe('getTeams', () => {
    it('returns team list from Linear API', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            data: { teams: { nodes: [{ id: 't1', name: 'Engineering', key: 'ENG' }] } },
          }),
        headers: new Map(),
      });

      const teams = await service.getTeams('enc', 'iv');

      expect(teams).toEqual([{ id: 't1', name: 'Engineering', key: 'ENG' }]);
    });
  });

  describe('getWorkflowStates', () => {
    it('returns workflow states for a team', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              team: {
                states: {
                  nodes: [
                    { id: 's1', name: 'Backlog', type: 'backlog', position: 0 },
                    { id: 's2', name: 'In Progress', type: 'started', position: 1 },
                  ],
                },
              },
            },
          }),
        headers: new Map(),
      });

      const states = await service.getWorkflowStates('enc', 'iv', 'team-1');

      expect(states).toHaveLength(2);
      expect(states[0].name).toBe('Backlog');
    });
  });

  describe('createIssue', () => {
    it('sends IssueCreate mutation with correct input', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              issueCreate: {
                success: true,
                issue: { id: 'issue-1', identifier: 'ENG-1', url: 'https://linear.app/ENG-1' },
              },
            },
          }),
        headers: new Map(),
      });

      const result = await service.createIssue('enc', 'iv', {
        teamId: 't1',
        title: 'Test Issue',
        description: 'Test description',
      });

      expect(result).toEqual({
        id: 'issue-1',
        identifier: 'ENG-1',
        url: 'https://linear.app/ENG-1',
      });
    });

    it('returns issue id, identifier, url', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              issueCreate: {
                success: true,
                issue: { id: 'i2', identifier: 'ENG-2', url: 'https://linear.app/ENG-2' },
              },
            },
          }),
        headers: new Map(),
      });

      const result = await service.createIssue('enc', 'iv', {
        teamId: 't1',
        title: 'Another Issue',
      });

      expect(result.id).toBe('i2');
      expect(result.identifier).toBe('ENG-2');
      expect(result.url).toBe('https://linear.app/ENG-2');
    });
  });

  describe('updateIssue', () => {
    it('sends IssueUpdate mutation with correct input', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              issueUpdate: {
                success: true,
                issue: { id: 'i1', identifier: 'ENG-1', updatedAt: '2026-01-01T00:00:00Z' },
              },
            },
          }),
        headers: new Map(),
      });

      const result = await service.updateIssue('enc', 'iv', 'i1', { title: 'Updated Title' });

      expect(result.id).toBe('i1');
      expect(result.updatedAt).toBe('2026-01-01T00:00:00Z');
    });
  });

  describe('getIssue', () => {
    it('returns issue data', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              issue: {
                id: 'i1',
                identifier: 'ENG-1',
                title: 'Test',
                url: 'https://linear.app/ENG-1',
                state: { id: 's1', name: 'Backlog', type: 'backlog' },
                priority: 3,
                updatedAt: '2026-01-01T00:00:00Z',
                createdAt: '2026-01-01T00:00:00Z',
              },
            },
          }),
        headers: new Map(),
      });

      const issue = await service.getIssue('enc', 'iv', 'i1');

      expect(issue).not.toBeNull();
      expect(issue!.identifier).toBe('ENG-1');
    });

    it('returns null for not found', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ data: { issue: null } }),
        headers: new Map(),
      });

      const issue = await service.getIssue('enc', 'iv', 'nonexistent');

      expect(issue).toBeNull();
    });
  });

  describe('addComment', () => {
    it('sends CommentCreate mutation', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            data: { commentCreate: { success: true, comment: { id: 'c1' } } },
          }),
        headers: new Map(),
      });

      const result = await service.addComment('enc', 'iv', 'i1', 'Test comment');

      expect(result.id).toBe('c1');
    });
  });

  describe('createWebhook', () => {
    it('sends WebhookCreate mutation', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            data: { webhookCreate: { success: true, webhook: { id: 'wh1', enabled: true } } },
          }),
        headers: new Map(),
      });

      const result = await service.createWebhook(
        'enc',
        'iv',
        't1',
        'https://example.com/webhook',
        'secret123',
      );

      expect(result.id).toBe('wh1');
      expect(result.enabled).toBe(true);
    });
  });

  describe('deleteWebhook', () => {
    it('sends WebhookDelete mutation', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ data: { webhookDelete: { success: true } } }),
        headers: new Map(),
      });

      await expect(service.deleteWebhook('enc', 'iv', 'wh1')).resolves.not.toThrow();
    });
  });

  describe('verifyToken', () => {
    it('returns valid:true for working token', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            data: { viewer: { id: 'u1', email: 'test@example.com', name: 'Test' } },
          }),
        headers: new Map(),
      });

      const result = await service.verifyToken('enc', 'iv');

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('u1');
      expect(result.email).toBe('test@example.com');
    });

    it('returns valid:false with error for expired token', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
        headers: new Map(),
      });

      const result = await service.verifyToken('enc', 'iv');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('log sanitization', () => {
    it('never logs access token in any error path', async () => {
      const logSpy = jest.spyOn(service['logger'], 'warn');

      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: () => Promise.resolve({ error: 'Server Error' }),
        headers: new Map(),
      });
      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: () => Promise.resolve({ error: 'Server Error' }),
        headers: new Map(),
      });
      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: () => Promise.resolve({ error: 'Server Error' }),
        headers: new Map(),
      });

      try {
        await service.query('sensitive-token-data', 'iv', 'query { test }');
      } catch {
        // expected
      }

      for (const call of logSpy.mock.calls) {
        const logMessage = call.join(' ');
        expect(logMessage).not.toContain('sensitive-token-data');
        expect(logMessage).not.toContain('decrypted-token');
      }
    }, 30000);
  });
});
