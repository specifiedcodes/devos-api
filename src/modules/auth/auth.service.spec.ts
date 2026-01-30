import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../../database/entities/user.entity';
import { BackupCode } from '../../database/entities/backup-code.entity';
import { AccountDeletion } from '../../database/entities/account-deletion.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EmailAlreadyExistsException } from './exceptions/email-already-exists.exception';
import { RedisService } from '../redis/redis.service';
import { EncryptionService } from '../../shared/encryption/encryption.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AnomalyDetectionService } from './services/anomaly-detection.service';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let redisService: RedisService;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn(),
    },
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
    decode: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };

  const mockRedisService = {
    blacklistToken: jest.fn(),
    isTokenBlacklisted: jest.fn(),
    healthCheck: jest.fn(),
    createTempToken: jest.fn(),
    validateTempToken: jest.fn(),
    deleteTempToken: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  };

  const mockBackupCodeRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  const mockAccountDeletionRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  const mockSecurityEventRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((text) => `encrypted_${text}`),
    decrypt: jest.fn((text) => text.replace('encrypted_', '')),
    hash: jest.fn((text) => `hashed_${text}`),
  };

  const mockWorkspacesService = {
    createDefaultWorkspace: jest.fn(),
  };

  const mockAnomalyDetectionService = {
    detectAnomalies: jest.fn(),
    recordLoginAttempt: jest.fn(),
    detectMultipleFailedAttempts: jest.fn().mockResolvedValue(false),
    recordSuccessfulLogin: jest.fn(),
    detectLoginAnomaly: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(BackupCode),
          useValue: mockBackupCodeRepository,
        },
        {
          provide: getRepositoryToken(AccountDeletion),
          useValue: mockAccountDeletionRepository,
        },
        {
          provide: getRepositoryToken(SecurityEvent),
          useValue: mockSecurityEventRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
        {
          provide: WorkspacesService,
          useValue: mockWorkspacesService,
        },
        {
          provide: AnomalyDetectionService,
          useValue: mockAnomalyDetectionService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);
    dataSource = module.get<DataSource>(DataSource);
    redisService = module.get<RedisService>(RedisService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('register', () => {
    const validRegisterDto: RegisterDto = {
      email: 'user@example.com',
      password: 'SecurePass123!',
      passwordConfirmation: 'SecurePass123!',
    };

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should successfully register a new user', async () => {
      // Arrange
      const mockUser = {
        id: 'uuid-123',
        email: 'user@example.com',
        passwordHash: 'hashedPassword',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-30T12:00:00Z'),
        updatedAt: new Date('2026-01-30T12:00:00Z'),
        lastLoginAt: null,
        twoFactorSecret: null,
      };

      mockUserRepository.findOne.mockResolvedValue(null); // Email doesn't exist
      mockUserRepository.create.mockReturnValue(mockUser);
      mockQueryRunner.manager.save.mockResolvedValue(mockUser);
      mockWorkspacesService.createDefaultWorkspace.mockResolvedValue({
        id: 'workspace-uuid',
        name: "User's Workspace",
        ownerUserId: mockUser.id,
        schemaName: 'workspace_abc123',
      });
      mockJwtService.sign.mockReturnValueOnce('access-token-123');
      mockJwtService.sign.mockReturnValueOnce('refresh-token-456');

      // Act
      const result = await service.register(validRegisterDto);

      // Assert
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.id).toBe('uuid-123');
      expect(result.user.email).toBe('user@example.com');
      expect(result.user.created_at).toBe('2026-01-30T12:00:00.000Z');
      expect(result.tokens.access_token).toBe('access-token-123');
      expect(result.tokens.refresh_token).toBe('refresh-token-456');
      expect(result.tokens.expires_in).toBe(86400);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should hash password with bcrypt cost factor 12', async () => {
      // Arrange
      const bcryptHashSpy = jest.spyOn(bcrypt, 'hash');
      const mockUser = {
        id: 'uuid-123',
        email: 'user@example.com',
        passwordHash: 'hashedPassword',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-30T12:00:00Z'),
        updatedAt: new Date('2026-01-30T12:00:00Z'),
        lastLoginAt: null,
        twoFactorSecret: null,
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockQueryRunner.manager.save.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.register(validRegisterDto);

      // Assert
      expect(bcryptHashSpy).toHaveBeenCalledWith('SecurePass123!', 12);

      bcryptHashSpy.mockRestore();
    });

    it('should store email in lowercase', async () => {
      // Arrange
      const registerDto: RegisterDto = {
        email: 'User@Example.COM',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };

      const mockUser = {
        id: 'uuid-123',
        email: 'user@example.com',
        passwordHash: 'hashedPassword',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-30T12:00:00Z'),
        updatedAt: new Date('2026-01-30T12:00:00Z'),
        lastLoginAt: null,
        twoFactorSecret: null,
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockQueryRunner.manager.save.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.register(registerDto);

      // Assert
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
        }),
      );
    });

    it('should throw EmailAlreadyExistsException if email already exists', async () => {
      // Arrange
      const existingUser = {
        id: 'uuid-existing',
        email: 'user@example.com',
        passwordHash: 'existingHash',
      };

      mockUserRepository.findOne.mockResolvedValue(existingUser);

      // Act & Assert
      await expect(service.register(validRegisterDto)).rejects.toThrow(
        EmailAlreadyExistsException,
      );
      await expect(service.register(validRegisterDto)).rejects.toThrow(
        'Email already registered: user@example.com',
      );
    });

    it('should throw BadRequestException if passwords do not match', async () => {
      // Arrange
      const invalidDto: RegisterDto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'DifferentPass456!',
      };

      // Act & Assert
      await expect(service.register(invalidDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.register(invalidDto)).rejects.toThrow(
        'Password confirmation does not match',
      );
    });

    it('should generate JWT access token with 24h expiry', async () => {
      // Arrange
      const mockUser = {
        id: 'uuid-123',
        email: 'user@example.com',
        passwordHash: 'hashedPassword',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-30T12:00:00Z'),
        updatedAt: new Date('2026-01-30T12:00:00Z'),
        lastLoginAt: null,
        twoFactorSecret: null,
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockQueryRunner.manager.save.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.register(validRegisterDto);

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'uuid-123',
          email: 'user@example.com',
        }),
        expect.objectContaining({
          expiresIn: '24h',
        }),
      );
    });

    it('should generate JWT refresh token with 30d expiry', async () => {
      // Arrange
      const mockUser = {
        id: 'uuid-123',
        email: 'user@example.com',
        passwordHash: 'hashedPassword',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-30T12:00:00Z'),
        updatedAt: new Date('2026-01-30T12:00:00Z'),
        lastLoginAt: null,
        twoFactorSecret: null,
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockQueryRunner.manager.save.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.register(validRegisterDto);

      // Assert - Second call to sign should be for refresh token
      // Note: Refresh token only contains sub and jti, not email
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sub: 'uuid-123',
          jti: expect.any(String),
        }),
        expect.objectContaining({
          expiresIn: '30d',
        }),
      );
    });

    it('should include user_id (sub) and email in JWT payload', async () => {
      // Arrange
      const mockUser = {
        id: 'uuid-123',
        email: 'user@example.com',
        passwordHash: 'hashedPassword',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-30T12:00:00Z'),
        updatedAt: new Date('2026-01-30T12:00:00Z'),
        lastLoginAt: null,
        twoFactorSecret: null,
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockQueryRunner.manager.save.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.register(validRegisterDto);

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'uuid-123',
          email: 'user@example.com',
        }),
        expect.anything(),
      );
    });

    it('should return user object without password hash', async () => {
      // Arrange
      const mockUser = {
        id: 'uuid-123',
        email: 'user@example.com',
        passwordHash: 'hashedPassword',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-30T12:00:00Z'),
        updatedAt: new Date('2026-01-30T12:00:00Z'),
        lastLoginAt: null,
        twoFactorSecret: null,
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(mockUser);
      mockQueryRunner.manager.save.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('token');

      // Act
      const result = await service.register(validRegisterDto);

      // Assert
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('email');
      expect(result.user).toHaveProperty('created_at');
    });

    it('should rollback transaction on error', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({
        email: 'user@example.com',
        passwordHash: 'hash',
      });
      mockQueryRunner.manager.save.mockRejectedValue(
        new Error('Database error'),
      );

      // Act & Assert
      await expect(service.register(validRegisterDto)).rejects.toThrow(
        'Database error',
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const validLoginDto: LoginDto = {
      email: 'user@example.com',
      password: 'SecurePass123!',
    };

    const mockExistingUser = {
      id: 'uuid-123',
      email: 'user@example.com',
      passwordHash: '$2b$12$hashedPasswordValue',
      twoFactorEnabled: false,
      createdAt: new Date('2026-01-30T12:00:00Z'),
      updatedAt: new Date('2026-01-30T12:00:00Z'),
      lastLoginAt: null,
      twoFactorSecret: null,
    };

    it('should successfully login existing user with correct password', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true) as any);
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockJwtService.sign.mockReturnValueOnce('access-token-123');
      mockJwtService.sign.mockReturnValueOnce('refresh-token-456');

      // Act
      const result = await service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0');

      // Assert
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      // Type guard: check if result is AuthResponseDto (not TwoFactorRequiredResponse)
      if ('user' in result) {
        expect(result.user.id).toBe('uuid-123');
        expect(result.user.email).toBe('user@example.com');
        expect(result.tokens.access_token).toBe('access-token-123');
        expect(result.tokens.refresh_token).toBe('refresh-token-456');
        expect(result.tokens.expires_in).toBe(86400);
      }
    });

    it('should update last_login_at timestamp on successful login', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true) as any);
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0');

      // Assert
      expect(mockUserRepository.update).toHaveBeenCalledWith(
        'uuid-123',
        expect.objectContaining({
          lastLoginAt: expect.any(Date),
        }),
      );
    });

    it('should throw UnauthorizedException for non-existent email', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException for incorrect password', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false) as any);

      // Act & Assert
      await expect(
        service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should use bcrypt.compare for password verification', async () => {
      // Arrange
      const bcryptCompareSpy = jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true) as any);
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0');

      // Assert
      expect(bcryptCompareSpy).toHaveBeenCalledWith(
        'SecurePass123!',
        '$2b$12$hashedPasswordValue',
      );

      bcryptCompareSpy.mockRestore();
    });

    it('should generate JWT access token with 24h expiry', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true) as any);
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0');

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'uuid-123',
          email: 'user@example.com',
        }),
        expect.objectContaining({
          expiresIn: '24h',
        }),
      );
    });

    it('should generate JWT refresh token with 30d expiry', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true) as any);
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0');

      // Assert
      // Note: Refresh token only contains sub and jti, not email
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sub: 'uuid-123',
          jti: expect.any(String),
        }),
        expect.objectContaining({
          expiresIn: '30d',
        }),
      );
    });

    it('should include user_id and email in JWT payload', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true) as any);
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0');

      // Assert
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'uuid-123',
          email: 'user@example.com',
        }),
        expect.anything(),
      );
    });

    it('should return user object without password hash', async () => {
      // Arrange
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true) as any);
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockJwtService.sign.mockReturnValue('token');

      // Act
      const result = await service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0');

      // Assert
      // Type guard: check if result is AuthResponseDto (not TwoFactorRequiredResponse)
      if ('user' in result) {
        expect(result.user).not.toHaveProperty('passwordHash');
        expect(result.user).toHaveProperty('id');
        expect(result.user).toHaveProperty('email');
        expect(result.user).toHaveProperty('created_at');
      }
    });

    it('should use case-insensitive email lookup', async () => {
      // Arrange
      const loginDto: LoginDto = {
        email: 'USER@EXAMPLE.COM',
        password: 'SecurePass123!',
      };
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true) as any);
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockJwtService.sign.mockReturnValue('token');

      // Act
      await service.login(loginDto, '192.168.1.1', 'Mozilla/5.0');

      // Assert
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
    });

    it('should use generic error message for security (no field indication)', async () => {
      // Arrange - Test with non-existent user
      mockUserRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0'),
      ).rejects.toThrow('Invalid email or password');

      // Arrange - Test with wrong password
      mockUserRepository.findOne.mockResolvedValue(mockExistingUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false) as any);

      // Act & Assert
      await expect(
        service.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0'),
      ).rejects.toThrow('Invalid email or password');
    });
  });
});
