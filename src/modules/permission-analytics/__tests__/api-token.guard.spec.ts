/**
 * ApiTokenGuard Tests
 * Story 20-10: Permission Analytics
 * Target: 14 tests
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTokenGuard } from '../guards/api-token.guard';
import { ApiTokenService } from '../services/api-token.service';
import { RedisService } from '../../redis/redis.service';
import { ApiTokenScope } from '../dto/create-api-token.dto';

describe('ApiTokenGuard', () => {
  let guard: ApiTokenGuard;
  let apiTokenService: jest.Mocked<ApiTokenService>;
  let redisService: jest.Mocked<RedisService>;
  let reflector: jest.Mocked<Reflector>;

  const mockTokenId = '33333333-3333-3333-3333-333333333333';
  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockRawToken = 'dvos_test1234567890abcdefghijklmno12345';

  function createMockContext(headers: Record<string, string> = {}): ExecutionContext {
    const request = {
      headers: headers,
    } as any;

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiTokenGuard,
        {
          provide: ApiTokenService,
          useValue: {
            validateToken: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            increment: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    guard = module.get<ApiTokenGuard>(ApiTokenGuard);
    apiTokenService = module.get(ApiTokenService);
    redisService = module.get(RedisService);
    reflector = module.get(Reflector);
  });

  it('valid API token passes guard', async () => {
    apiTokenService.validateToken.mockResolvedValue({
      token: { id: mockTokenId, scopes: ['permissions:check'] } as any,
      workspaceId: mockWorkspaceId,
    });

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('invalid API token returns 401', async () => {
    apiTokenService.validateToken.mockResolvedValue(null);

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('expired API token returns 401', async () => {
    apiTokenService.validateToken.mockResolvedValue(null);

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('revoked API token returns 401', async () => {
    apiTokenService.validateToken.mockResolvedValue(null);

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('missing Authorization header returns 401', async () => {
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('non-dvos_ token returns 401', async () => {
    const context = createMockContext({ authorization: 'Bearer jwt_token_here' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('token with correct scope passes', async () => {
    apiTokenService.validateToken.mockResolvedValue({
      token: { id: mockTokenId, scopes: ['permissions:check'] } as any,
      workspaceId: mockWorkspaceId,
    });
    reflector.get.mockReturnValue(ApiTokenScope.PERMISSIONS_CHECK);

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('token with wrong scope returns 403', async () => {
    apiTokenService.validateToken.mockResolvedValue({
      token: { id: mockTokenId, scopes: ['members:read'] } as any,
      workspaceId: mockWorkspaceId,
    });
    reflector.get.mockReturnValue(ApiTokenScope.PERMISSIONS_CHECK);

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('rate limit within threshold passes', async () => {
    apiTokenService.validateToken.mockResolvedValue({
      token: { id: mockTokenId, scopes: ['permissions:check'] } as any,
      workspaceId: mockWorkspaceId,
    });
    redisService.get.mockResolvedValue('500'); // Under limit

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('rate limit exceeded returns 429', async () => {
    apiTokenService.validateToken.mockResolvedValue({
      token: { id: mockTokenId, scopes: ['permissions:check'] } as any,
      workspaceId: mockWorkspaceId,
    });
    redisService.get.mockResolvedValue('1000'); // At limit

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(context);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('Redis failure fails open (allows request)', async () => {
    apiTokenService.validateToken.mockResolvedValue({
      token: { id: mockTokenId, scopes: ['permissions:check'] } as any,
      workspaceId: mockWorkspaceId,
    });
    redisService.get.mockRejectedValue(new Error('Redis down'));

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('workspaceId attached to request object', async () => {
    apiTokenService.validateToken.mockResolvedValue({
      token: { id: mockTokenId, scopes: ['permissions:check'] } as any,
      workspaceId: mockWorkspaceId,
    });

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });
    await guard.canActivate(context);

    const request = context.switchToHttp().getRequest();
    expect(request.apiTokenWorkspaceId).toBe(mockWorkspaceId);
  });

  it('tokenId attached to request object', async () => {
    apiTokenService.validateToken.mockResolvedValue({
      token: { id: mockTokenId, scopes: ['permissions:check'] } as any,
      workspaceId: mockWorkspaceId,
    });

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });
    await guard.canActivate(context);

    const request = context.switchToHttp().getRequest();
    expect(request.apiTokenId).toBe(mockTokenId);
  });

  it('does not throw on rate limit increment failure', async () => {
    apiTokenService.validateToken.mockResolvedValue({
      token: { id: mockTokenId, scopes: ['permissions:check'] } as any,
      workspaceId: mockWorkspaceId,
    });
    redisService.get.mockResolvedValue(null);
    redisService.increment.mockRejectedValue(new Error('Redis down'));

    const context = createMockContext({ authorization: `Bearer ${mockRawToken}` });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });
});
