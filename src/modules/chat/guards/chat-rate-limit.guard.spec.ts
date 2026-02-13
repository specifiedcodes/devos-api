import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ChatRateLimitGuard } from './chat-rate-limit.guard';
import { RateLimiterService } from '../../../shared/cache/rate-limiter.service';

describe('ChatRateLimitGuard', () => {
  let guard: ChatRateLimitGuard;
  let rateLimiterService: RateLimiterService;

  const mockWorkspaceId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440002';

  const createMockContext = (
    user: any,
    workspaceId: string | null,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { workspaceId },
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatRateLimitGuard,
        {
          provide: RateLimiterService,
          useValue: {
            checkLimit: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<ChatRateLimitGuard>(ChatRateLimitGuard);
    rateLimiterService = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow requests under rate limit', async () => {
      jest.spyOn(rateLimiterService, 'checkLimit').mockResolvedValue(undefined);

      const context = createMockContext(
        { sub: mockUserId },
        mockWorkspaceId,
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      // 3 checks: per-minute, per-hour, per-day workspace aggregate
      expect(rateLimiterService.checkLimit).toHaveBeenCalledTimes(3);
    });

    it('should check per-minute rate limit with correct parameters', async () => {
      jest.spyOn(rateLimiterService, 'checkLimit').mockResolvedValue(undefined);

      const context = createMockContext(
        { sub: mockUserId },
        mockWorkspaceId,
      );

      await guard.canActivate(context);

      expect(rateLimiterService.checkLimit).toHaveBeenCalledWith(
        `chat:rate:min:${mockWorkspaceId}:${mockUserId}`,
        10, // 10 messages per minute
        60000, // 1 minute in ms
      );
    });

    it('should check per-hour rate limit with correct parameters', async () => {
      jest.spyOn(rateLimiterService, 'checkLimit').mockResolvedValue(undefined);

      const context = createMockContext(
        { sub: mockUserId },
        mockWorkspaceId,
      );

      await guard.canActivate(context);

      expect(rateLimiterService.checkLimit).toHaveBeenCalledWith(
        `chat:rate:hr:${mockWorkspaceId}:${mockUserId}`,
        100, // 100 messages per hour
        3600000, // 1 hour in ms
      );
    });

    it('should block requests over per-minute limit with 429 error', async () => {
      jest
        .spyOn(rateLimiterService, 'checkLimit')
        .mockRejectedValueOnce(
          new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS),
        );

      const context = createMockContext(
        { sub: mockUserId },
        mockWorkspaceId,
      );

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const response = httpError.getResponse() as any;
        expect(response.errorCode).toBe('RATE_LIMIT_EXCEEDED');
        expect(response.retryAfter).toBe(60);
      }
    });

    it('should block requests over per-hour limit with 429 error', async () => {
      // First call (per-minute) succeeds, second call (per-hour) fails
      jest
        .spyOn(rateLimiterService, 'checkLimit')
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(
          new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS),
        );

      const context = createMockContext(
        { sub: mockUserId },
        mockWorkspaceId,
      );

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        // Reset mocks for the actual test
        jest
          .spyOn(rateLimiterService, 'checkLimit')
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(
            new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS),
          );
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const response = httpError.getResponse() as any;
        expect(response.errorCode).toBe('RATE_LIMIT_EXCEEDED');
        expect(response.retryAfter).toBe(3600);
      }
    });

    it('should return 429 with Retry-After header information', async () => {
      jest
        .spyOn(rateLimiterService, 'checkLimit')
        .mockRejectedValueOnce(
          new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS),
        );

      const context = createMockContext(
        { sub: mockUserId },
        mockWorkspaceId,
      );

      try {
        await guard.canActivate(context);
        fail('Expected exception to be thrown');
      } catch (error) {
        const httpError = error as HttpException;
        const response = httpError.getResponse() as any;
        expect(response).toHaveProperty('retryAfter');
      }
    });

    it('should track limits per user per workspace', async () => {
      jest.spyOn(rateLimiterService, 'checkLimit').mockResolvedValue(undefined);

      const user1Workspace1 = createMockContext(
        { sub: 'user-1' },
        'workspace-1',
      );
      const user2Workspace1 = createMockContext(
        { sub: 'user-2' },
        'workspace-1',
      );
      const user1Workspace2 = createMockContext(
        { sub: 'user-1' },
        'workspace-2',
      );

      await guard.canActivate(user1Workspace1);
      await guard.canActivate(user2Workspace1);
      await guard.canActivate(user1Workspace2);

      // Should have 9 calls total (3 checks per request: minute + hour + day)
      expect(rateLimiterService.checkLimit).toHaveBeenCalledTimes(9);

      // Verify different keys were used
      const calls = jest.spyOn(rateLimiterService, 'checkLimit').mock.calls;
      const minuteKeys = calls.filter((c) => (c[0] as string).includes(':min:'));
      const uniqueMinuteKeys = new Set(minuteKeys.map((c) => c[0]));
      expect(uniqueMinuteKeys.size).toBe(3);
    });

    it('should check per-day workspace aggregate rate limit', async () => {
      jest.spyOn(rateLimiterService, 'checkLimit').mockResolvedValue(undefined);

      const context = createMockContext(
        { sub: mockUserId },
        mockWorkspaceId,
      );

      await guard.canActivate(context);

      expect(rateLimiterService.checkLimit).toHaveBeenCalledWith(
        `chat:rate:day:${mockWorkspaceId}`,
        1000, // 1000 messages per day per workspace
        86400000, // 24 hours in ms
      );
    });

    it('should block requests over per-day workspace limit with 429 error', async () => {
      // Per-minute and per-hour succeed, per-day fails
      jest
        .spyOn(rateLimiterService, 'checkLimit')
        .mockResolvedValueOnce(undefined) // per-minute passes
        .mockResolvedValueOnce(undefined) // per-hour passes
        .mockRejectedValueOnce(
          new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS),
        ); // per-day fails

      const context = createMockContext(
        { sub: mockUserId },
        mockWorkspaceId,
      );

      try {
        await guard.canActivate(context);
        fail('Expected exception to be thrown');
      } catch (error) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const response = httpError.getResponse() as any;
        expect(response.errorCode).toBe('RATE_LIMIT_EXCEEDED');
        expect(response.retryAfter).toBe(86400);
      }
    });

    it('should pass through when no user is present', async () => {
      const context = createMockContext(null, mockWorkspaceId);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(rateLimiterService.checkLimit).not.toHaveBeenCalled();
    });

    it('should pass through when no workspaceId is present', async () => {
      const context = createMockContext({ sub: mockUserId }, null);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(rateLimiterService.checkLimit).not.toHaveBeenCalled();
    });

    it('should handle user.id as fallback for user identifier', async () => {
      jest.spyOn(rateLimiterService, 'checkLimit').mockResolvedValue(undefined);

      const context = createMockContext(
        { id: 'user-id-format' }, // Using id instead of sub
        mockWorkspaceId,
      );

      await guard.canActivate(context);

      expect(rateLimiterService.checkLimit).toHaveBeenCalledWith(
        `chat:rate:min:${mockWorkspaceId}:user-id-format`,
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('should propagate non-rate-limit errors', async () => {
      const unexpectedError = new Error('Database connection failed');
      jest.spyOn(rateLimiterService, 'checkLimit').mockRejectedValue(unexpectedError);

      const context = createMockContext(
        { sub: mockUserId },
        mockWorkspaceId,
      );

      await expect(guard.canActivate(context)).rejects.toThrow('Database connection failed');
    });
  });
});
