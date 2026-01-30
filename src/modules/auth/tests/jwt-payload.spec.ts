import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from '../auth.service';
import { User } from '../../../database/entities/user.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { SecurityEvent } from '../../../database/entities/security-event.entity';
import { BackupCode } from '../../../database/entities/backup-code.entity';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';

describe('AuthService - JWT Payload with workspace_id', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let redisService: RedisService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hash',
    currentWorkspaceId: 'workspace-456',
    workspaceMembers: [
      {
        workspaceId: 'workspace-456',
        userId: 'user-123',
        role: 'owner',
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SecurityEvent),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BackupCode),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            keys: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_SECRET') return 'test-secret';
              if (key === 'JWT_ACCESS_EXPIRY') return '24h';
              if (key === 'JWT_REFRESH_EXPIRY') return '30d';
              return null;
            }),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should include workspace_id in access token payload', async () => {
    const userId = 'user-123';
    const email = 'test@example.com';
    const workspaceId = 'workspace-456';

    (jwtService.sign as jest.Mock).mockReturnValue('mock-access-token');

    // Access private method via reflection
    const tokens = await (authService as any).generateTokens(userId, email, workspaceId);

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: userId,
        email: email,
        workspaceId: workspaceId,
        jti: expect.any(String),
      }),
      expect.any(Object),
    );
  });

  it('should include workspace_id in refresh token payload', async () => {
    const userId = 'user-123';
    const email = 'test@example.com';
    const workspaceId = 'workspace-456';

    (jwtService.sign as jest.Mock).mockReturnValue('mock-refresh-token');

    await (authService as any).generateTokens(userId, email, workspaceId);

    // Check second call (refresh token)
    const secondCall = (jwtService.sign as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toMatchObject({
      sub: userId,
      email: email,
      workspaceId: workspaceId,
      jti: expect.any(String),
    });
  });

  it('should generate unique JTIs for access and refresh tokens', async () => {
    const userId = 'user-123';
    const email = 'test@example.com';
    const workspaceId = 'workspace-456';

    (jwtService.sign as jest.Mock).mockReturnValue('mock-token');

    await (authService as any).generateTokens(userId, email, workspaceId);

    const accessTokenCall = (jwtService.sign as jest.Mock).mock.calls[0];
    const refreshTokenCall = (jwtService.sign as jest.Mock).mock.calls[1];

    expect(accessTokenCall[0].jti).toBeDefined();
    expect(refreshTokenCall[0].jti).toBeDefined();
    expect(accessTokenCall[0].jti).not.toBe(refreshTokenCall[0].jti);
  });

  it('should set correct expiry times for tokens', async () => {
    const userId = 'user-123';
    const email = 'test@example.com';
    const workspaceId = 'workspace-456';

    (jwtService.sign as jest.Mock).mockReturnValue('mock-token');

    await (authService as any).generateTokens(userId, email, workspaceId);

    const accessTokenOptions = (jwtService.sign as jest.Mock).mock.calls[0][1];
    const refreshTokenOptions = (jwtService.sign as jest.Mock).mock.calls[1][1];

    expect(accessTokenOptions.expiresIn).toBe('24h');
    expect(refreshTokenOptions.expiresIn).toBe('30d');
  });

  it('should throw error if workspace_id is null or undefined', async () => {
    const userId = 'user-123';
    const email = 'test@example.com';
    const workspaceId = null;

    await expect(
      (authService as any).generateTokens(userId, email, workspaceId),
    ).rejects.toThrow();
  });

  it('should create session with workspace_id', async () => {
    const userId = 'user-123';
    const workspaceId = 'workspace-456';
    const accessTokenJti = 'access-jti';
    const refreshTokenJti = 'refresh-jti';
    const ipAddress = '127.0.0.1';
    const userAgent = 'test-agent';

    (redisService.set as jest.Mock).mockResolvedValue('OK');

    await (authService as any).createSession(
      userId,
      workspaceId,
      accessTokenJti,
      refreshTokenJti,
      ipAddress,
      userAgent,
    );

    expect(redisService.set).toHaveBeenCalledWith(
      expect.stringMatching(/^session:user-123:/),
      expect.stringContaining('"workspace_id":"workspace-456"'),
      expect.any(Number),
    );
  });
});
