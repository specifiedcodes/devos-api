import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, HttpException, ExecutionContext } from '@nestjs/common';
import { ScimAuthGuard } from '../guards/scim-auth.guard';
import { ScimTokenService } from '../scim-token.service';
import { ScimConfiguration } from '../../../../database/entities/scim-configuration.entity';
import { SsoAuditService } from '../../sso-audit.service';
import { RedisService } from '../../../redis/redis.service';

describe('ScimAuthGuard', () => {
  let guard: ScimAuthGuard;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const tokenId = '550e8400-e29b-41d4-a716-446655440002';

  const mockScimTokenService = {
    validateToken: jest.fn(),
    updateLastUsed: jest.fn().mockResolvedValue(undefined),
  };

  const mockScimConfigRepository = {
    findOne: jest.fn(),
  };

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockRedisService = {
    increment: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
  };

  const createMockContext = (headers: Record<string, string> = {}): ExecutionContext => {
    const request = {
      headers: { ...headers },
      socket: { remoteAddress: '127.0.0.1' },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScimAuthGuard,
        { provide: ScimTokenService, useValue: mockScimTokenService },
        { provide: getRepositoryToken(ScimConfiguration), useValue: mockScimConfigRepository },
        { provide: SsoAuditService, useValue: mockSsoAuditService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    guard = module.get<ScimAuthGuard>(ScimAuthGuard);
  });

  it('should return true for valid active token with SCIM enabled', async () => {
    const ctx = createMockContext({ authorization: 'Bearer valid-token' });
    mockScimTokenService.validateToken.mockResolvedValue({ id: tokenId, workspaceId, isActive: true });
    mockScimConfigRepository.findOne.mockResolvedValue({ workspaceId, enabled: true });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException when no Authorization header', async () => {
    const ctx = createMockContext({});

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when header format is not "Bearer <token>"', async () => {
    const ctx = createMockContext({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when token hash not found in database', async () => {
    const ctx = createMockContext({ authorization: 'Bearer invalid-token' });
    mockScimTokenService.validateToken.mockResolvedValue(null);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when SCIM config not enabled for workspace', async () => {
    const ctx = createMockContext({ authorization: 'Bearer valid-token' });
    mockScimTokenService.validateToken.mockResolvedValue({ id: tokenId, workspaceId, isActive: true });
    mockScimConfigRepository.findOne.mockResolvedValue({ workspaceId, enabled: false });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should log SCIM_AUTH_FAILURE audit event on authentication failure', async () => {
    const ctx = createMockContext({ authorization: 'Bearer invalid-token' });
    mockScimTokenService.validateToken.mockResolvedValue(null);

    try {
      await guard.canActivate(ctx);
    } catch {}

    await new Promise((r) => setTimeout(r, 10));
    expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: expect.stringContaining('scim_auth_failure'),
      }),
    );
  });

  it('should attach workspaceId to request on success', async () => {
    const ctx = createMockContext({ authorization: 'Bearer valid-token' });
    const request = ctx.switchToHttp().getRequest();
    mockScimTokenService.validateToken.mockResolvedValue({ id: tokenId, workspaceId, isActive: true });
    mockScimConfigRepository.findOne.mockResolvedValue({ workspaceId, enabled: true });

    await guard.canActivate(ctx);

    expect((request as any).scimWorkspaceId).toBe(workspaceId);
  });

  it('should attach scimConfig to request on success', async () => {
    const ctx = createMockContext({ authorization: 'Bearer valid-token' });
    const request = ctx.switchToHttp().getRequest();
    const config = { workspaceId, enabled: true, defaultRole: 'developer' };
    mockScimTokenService.validateToken.mockResolvedValue({ id: tokenId, workspaceId, isActive: true });
    mockScimConfigRepository.findOne.mockResolvedValue(config);

    await guard.canActivate(ctx);

    expect((request as any).scimConfig).toEqual(config);
  });

  it('should update last_used_at on token after successful auth', async () => {
    const ctx = createMockContext({ authorization: 'Bearer valid-token' });
    mockScimTokenService.validateToken.mockResolvedValue({ id: tokenId, workspaceId, isActive: true });
    mockScimConfigRepository.findOne.mockResolvedValue({ workspaceId, enabled: true });

    await guard.canActivate(ctx);

    await new Promise((r) => setTimeout(r, 10));
    expect(mockScimTokenService.updateLastUsed).toHaveBeenCalledWith(tokenId);
  });

  it('should return 429 when rate limit exceeded (100 req/min)', async () => {
    const ctx = createMockContext({ authorization: 'Bearer valid-token' });
    mockScimTokenService.validateToken.mockResolvedValue({ id: tokenId, workspaceId, isActive: true });
    mockScimConfigRepository.findOne.mockResolvedValue({ workspaceId, enabled: true });
    mockRedisService.increment.mockResolvedValue(101);

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(ctx);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('should log SCIM_RATE_LIMITED on rate limit hit', async () => {
    const ctx = createMockContext({ authorization: 'Bearer valid-token' });
    mockScimTokenService.validateToken.mockResolvedValue({ id: tokenId, workspaceId, isActive: true });
    mockScimConfigRepository.findOne.mockResolvedValue({ workspaceId, enabled: true });
    mockRedisService.increment.mockResolvedValue(101);

    try {
      await guard.canActivate(ctx);
    } catch {}

    await new Promise((r) => setTimeout(r, 10));
    expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: expect.stringContaining('scim_rate_limited'),
      }),
    );
  });

  it('should handle missing SCIM configuration (workspace has no SCIM config)', async () => {
    const ctx = createMockContext({ authorization: 'Bearer valid-token' });
    mockScimTokenService.validateToken.mockResolvedValue({ id: tokenId, workspaceId, isActive: true });
    mockScimConfigRepository.findOne.mockResolvedValue(null);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should set rate limit expiry on first request in window', async () => {
    const ctx = createMockContext({ authorization: 'Bearer valid-token' });
    mockScimTokenService.validateToken.mockResolvedValue({ id: tokenId, workspaceId, isActive: true });
    mockScimConfigRepository.findOne.mockResolvedValue({ workspaceId, enabled: true });
    mockRedisService.increment.mockResolvedValue(1);

    await guard.canActivate(ctx);

    expect(mockRedisService.expire).toHaveBeenCalledWith(
      expect.stringContaining(workspaceId),
      60,
    );
  });
});
