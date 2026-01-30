import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { EmailAlreadyExistsException } from './exceptions/email-already-exists.exception';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';

// Mock Response object
const mockResponse = () => {
  const res: Partial<Response> = {};
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(LoginThrottlerGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /api/auth/register', () => {
    const validRegisterDto: RegisterDto = {
      email: 'user@example.com',
      password: 'SecurePass123!',
      passwordConfirmation: 'SecurePass123!',
    };

    const mockAuthResponse: AuthResponseDto = {
      user: {
        id: 'uuid-123',
        email: 'user@example.com',
        created_at: '2026-01-30T12:00:00.000Z',
      },
      tokens: {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
        expires_in: 86400,
      },
    };

    it('should return 201 Created with user and tokens', async () => {
      // Arrange
      mockAuthService.register.mockResolvedValue(mockAuthResponse);
      const res = mockResponse();

      // Act
      const result = await controller.register(validRegisterDto, '192.168.1.1', 'Mozilla/5.0', res);

      // Assert
      expect(result).toEqual(mockAuthResponse);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.id).toBe('uuid-123');
      expect(result.tokens.access_token).toBe('access-token-123');
      expect(res.cookie).toHaveBeenCalled();
    });

    it('should return 400 Bad Request for invalid email', async () => {
      // Arrange
      const invalidDto: RegisterDto = {
        email: 'invalid-email',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };

      mockAuthService.register.mockRejectedValue(
        new BadRequestException('Invalid email format'),
      );

      // Act & Assert
      const res = mockResponse();
      await expect(controller.register(invalidDto, '192.168.1.1', 'Mozilla/5.0', res)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return 400 Bad Request for weak password', async () => {
      // Arrange
      const weakPasswordDto: RegisterDto = {
        email: 'user@example.com',
        password: 'weak',
        passwordConfirmation: 'weak',
      };

      mockAuthService.register.mockRejectedValue(
        new BadRequestException('Weak password'),
      );

      // Act & Assert
      const res = mockResponse();
      await expect(controller.register(weakPasswordDto, '192.168.1.1', 'Mozilla/5.0', res)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return 409 Conflict for duplicate email', async () => {
      // Arrange
      mockAuthService.register.mockRejectedValue(
        new EmailAlreadyExistsException('user@example.com'),
      );

      // Act & Assert
      const res = mockResponse();
      await expect(controller.register(validRegisterDto, '192.168.1.1', 'Mozilla/5.0', res)).rejects.toThrow(
        EmailAlreadyExistsException,
      );
      await expect(controller.register(validRegisterDto, '192.168.1.1', 'Mozilla/5.0', res)).rejects.toThrow(
        'Email already registered: user@example.com',
      );
    });

    it('should call AuthService.register with correct DTO', async () => {
      // Arrange
      mockAuthService.register.mockResolvedValue(mockAuthResponse);
      const res = mockResponse();

      // Act
      await controller.register(validRegisterDto, '192.168.1.1', 'Mozilla/5.0', res);

      // Assert
      expect(mockAuthService.register).toHaveBeenCalledWith(validRegisterDto, '192.168.1.1', 'Mozilla/5.0');
      expect(mockAuthService.register).toHaveBeenCalledTimes(1);
    });

    it('should propagate service errors to caller', async () => {
      // Arrange
      const serviceError = new Error('Database connection failed');
      mockAuthService.register.mockRejectedValue(serviceError);
      const res = mockResponse();

      // Act & Assert
      await expect(controller.register(validRegisterDto, '192.168.1.1', 'Mozilla/5.0', res)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('POST /api/auth/login', () => {
    const validLoginDto: LoginDto = {
      email: 'user@example.com',
      password: 'SecurePass123!',
    };

    const mockAuthResponse: AuthResponseDto = {
      user: {
        id: 'uuid-123',
        email: 'user@example.com',
        created_at: '2026-01-30T12:00:00.000Z',
      },
      tokens: {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
        expires_in: 86400,
      },
    };

    it('should return 200 OK with user and tokens on successful login', async () => {
      // Arrange
      mockAuthService.login.mockResolvedValue(mockAuthResponse);
      const res = mockResponse();

      // Act
      const result = await controller.login(
        validLoginDto,
        '192.168.1.1',
        'Mozilla/5.0',
        res,
      );

      // Assert
      expect(result).toEqual(mockAuthResponse);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      // Type guard: check if result is AuthResponseDto (not TwoFactorRequiredResponse)
      if ('user' in result) {
        expect(result.user.id).toBe('uuid-123');
        expect(result.tokens.access_token).toBe('access-token-123');
      }
      expect(res.cookie).toHaveBeenCalled();
    });

    it('should return 401 Unauthorized for invalid email', async () => {
      // Arrange
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid email or password'),
      );
      const res = mockResponse();

      // Act & Assert
      await expect(
        controller.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0', res),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        controller.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0', res),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should return 401 Unauthorized for incorrect password', async () => {
      // Arrange
      const wrongPasswordDto: LoginDto = {
        email: 'user@example.com',
        password: 'WrongPassword123!',
      };

      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid email or password'),
      );
      const res = mockResponse();

      // Act & Assert
      await expect(
        controller.login(wrongPasswordDto, '192.168.1.1', 'Mozilla/5.0', res),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should pass IP address to AuthService.login()', async () => {
      // Arrange
      mockAuthService.login.mockResolvedValue(mockAuthResponse);
      const res = mockResponse();

      // Act
      await controller.login(validLoginDto, '203.0.113.45', 'Mozilla/5.0', res);

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(
        validLoginDto,
        '203.0.113.45',
        'Mozilla/5.0',
      );
    });

    it('should pass user-agent to AuthService.login()', async () => {
      // Arrange
      mockAuthService.login.mockResolvedValue(mockAuthResponse);
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
      const res = mockResponse();

      // Act
      await controller.login(validLoginDto, '192.168.1.1', userAgent, res);

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(
        validLoginDto,
        '192.168.1.1',
        userAgent,
      );
    });

    it('should call AuthService.login with correct DTO', async () => {
      // Arrange
      mockAuthService.login.mockResolvedValue(mockAuthResponse);
      const res = mockResponse();

      // Act
      await controller.login(validLoginDto, '192.168.1.1', 'Mozilla/5.0', res);

      // Assert
      expect(mockAuthService.login).toHaveBeenCalledWith(
        validLoginDto,
        '192.168.1.1',
        'Mozilla/5.0',
      );
      expect(mockAuthService.login).toHaveBeenCalledTimes(1);
    });
  });
});
