import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
  UseGuards,
  Req,
  Res,
  Param,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ProfileDto } from './dto/profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { Verify2FASetupDto } from './dto/verify-2fa-setup.dto';
import { Disable2FADto } from './dto/disable-2fa.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { VerifyBackupCodeDto } from './dto/verify-backup-code.dto';
import { SecurityDashboardDto } from './dto/security-dashboard.dto';
import { SessionDto } from './dto/session.dto';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { User } from '../../database/entities/user.entity';

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  private setCookies(
    response: Response,
    tokens: { access_token: string; refresh_token: string },
  ) {
    const isProduction = process.env.NODE_ENV === 'production';

    response.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    response.cookie('refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  @Post('register')
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 1000 : 5, ttl: 3600000 } }) // 5 requests per hour (relaxed in test)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid email format or weak password',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Email already registered',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error - Database error',
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const authResponse = await this.authService.register(
      registerDto,
      ipAddress,
      userAgent || 'unknown',
    );
    this.setCookies(response, authResponse.tokens);
    return authResponse;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes (900,000ms), tracked by email+IP
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'User successfully authenticated',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid email or password',
  })
  @ApiResponse({
    status: 429,
    description:
      'Too Many Requests - Rate limit exceeded (5 attempts per 15 minutes)',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error - Database error',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto | { requires_2fa: true; temp_token: string; backup_codes_remaining?: number }> {
    const authResponse = await this.authService.login(
      loginDto,
      ipAddress,
      userAgent || 'unknown',
    );

    // Only set cookies if we got standard auth response (not 2FA required)
    if ('tokens' in authResponse) {
      this.setCookies(response, authResponse.tokens);
    }

    return authResponse;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 requests per 15 minutes (matches login security NFR-S17)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'New access token issued',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    // Extract refresh token from cookie
    const refreshToken = request.cookies['refresh_token'];

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    // Call service to refresh tokens
    const authResponse =
      await this.authService.refreshAccessToken(refreshToken);

    // Set new tokens in httpOnly cookies
    this.setCookies(response, authResponse.tokens);

    return authResponse;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard) // Require authentication to logout
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout user and invalidate tokens' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Not authenticated',
  })
  async logout(
    @Req() request: Request & { user: User },
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string; userId: string }> {
    const userId = request.user.id;

    // Extract tokens from cookies
    const accessToken = request.cookies['access_token'];
    const refreshToken = request.cookies['refresh_token'];

    // Blacklist tokens if they exist
    if (accessToken) {
      await this.authService.blacklistToken(accessToken, 24 * 60 * 60); // 24h TTL
    }
    if (refreshToken) {
      await this.authService.blacklistToken(refreshToken, 30 * 24 * 60 * 60); // 30d TTL
    }

    // Clear cookies
    response.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    this.logger.log(`User logged out successfully: ${userId}`);

    return { message: 'Logged out successfully', userId };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile with 2FA status' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: ProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentUser(@Req() request: Request & { user: User }): Promise<ProfileDto> {
    return this.authService.getProfile(request.user.id);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Enable 2FA for authenticated user' })
  @ApiResponse({
    status: 200,
    description: '2FA setup initiated, QR code and backup codes returned',
  })
  @ApiResponse({ status: 400, description: '2FA already enabled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async enable2FA(@Req() request: Request & { user: User }): Promise<{
    qrCode: string;
    secret: string;
    backupCodes: string[];
  }> {
    return this.authService.enable2FA(request.user.id);
  }

  @Post('2fa/verify-setup')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 attempts per 5 minutes to prevent brute force
  @ApiOperation({
    summary: 'Verify 2FA setup with code from authenticator app',
  })
  @ApiResponse({ status: 200, description: '2FA enabled successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid code or setup not initiated',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized or invalid verification code',
  })
  @ApiResponse({
    status: 429,
    description: 'Too Many Requests - Rate limit exceeded',
  })
  async verify2FASetup(
    @Req() request: Request & { user: User },
    @Body() dto: Verify2FASetupDto,
  ): Promise<{ message: string }> {
    await this.authService.verify2FASetup(request.user.id, dto.code);
    return { message: '2FA enabled successfully' };
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Disable 2FA for authenticated user' })
  @ApiResponse({ status: 200, description: '2FA disabled successfully' })
  @ApiResponse({ status: 400, description: '2FA not enabled' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized or invalid password',
  })
  async disable2FA(
    @Req() request: Request & { user: User },
    @Body() dto: Disable2FADto,
  ): Promise<{ message: string }> {
    await this.authService.disable2FA(request.user.id, dto.password);
    return { message: '2FA disabled successfully' };
  }

  @Post('2fa/backup-codes/regenerate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Regenerate backup codes (invalidates old codes)',
  })
  @ApiResponse({ status: 200, description: 'New backup codes generated' })
  @ApiResponse({ status: 400, description: '2FA not enabled' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized or invalid password',
  })
  async regenerateBackupCodes(
    @Req() request: Request & { user: User },
    @Body() dto: Disable2FADto, // Reuse DTO since it's just password
  ): Promise<{ backupCodes: string[] }> {
    const backupCodes = await this.authService.regenerateBackupCodes(
      request.user.id,
      dto.password,
    );
    return { backupCodes };
  }

  @Post('2fa/verify')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({ summary: 'Verify 2FA code during login' })
  @ApiResponse({
    status: 200,
    description: '2FA verification successful, JWT tokens returned',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid code or expired token' })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  async verify2FA(
    @Body() dto: Verify2FADto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const authResponse = await this.authService.verify2FA(
      dto.temp_token,
      dto.code,
    );
    this.setCookies(response, authResponse.tokens);
    return authResponse;
  }

  @Post('2fa/verify-backup')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({ summary: 'Verify backup code during login (2FA recovery)' })
  @ApiResponse({
    status: 200,
    description: 'Backup code verification successful, JWT tokens returned',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or used backup code' })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  async verify2FABackup(
    @Body() dto: VerifyBackupCodeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto & { backup_codes_remaining?: number }> {
    const authResponse = await this.authService.verify2FABackup(
      dto.temp_token,
      dto.backup_code,
    );
    this.setCookies(response, authResponse.tokens);
    return authResponse;
  }

  // ========== Profile Management (Story 1.9) ==========

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: ProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too Many Requests - Rate limit exceeded' })
  async getProfile(@Req() req: Request & { user: User }): Promise<ProfileDto> {
    return this.authService.getProfile(req.user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 attempts per 15 minutes
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or new password same as current',
  })
  @ApiResponse({ status: 401, description: 'Current password incorrect' })
  @ApiResponse({ status: 429, description: 'Too many password change attempts' })
  async changePassword(
    @Req() req: Request & { user: User },
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(
      req.user.id,
      dto.current_password,
      dto.new_password,
      dto.confirm_password,
    );

    return { message: 'Password changed successfully. Please log in again.' };
  }

  @Post('account/delete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Delete user account (GDPR compliance - soft delete with 30-day grace period)',
  })
  @ApiResponse({
    status: 200,
    description: 'Account deletion initiated successfully',
  })
  @ApiResponse({ status: 401, description: 'Password incorrect' })
  async deleteAccount(
    @Req() req: Request & { user: User },
    @Body() dto: DeleteAccountDto,
  ): Promise<{ message: string }> {
    await this.authService.deleteAccount(req.user.id, dto.password);

    return {
      message:
        'Your account has been scheduled for deletion. You have 30 days to contact support if you change your mind.',
    };
  }

  // ============================================================================
  // SESSION MANAGEMENT & SECURITY MONITORING (Story 1.10)
  // ============================================================================

  @Get('security/dashboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get security dashboard metrics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard metrics',
    type: SecurityDashboardDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async getSecurityDashboard(): Promise<SecurityDashboardDto> {
    // TODO: Add admin role guard when RBAC is implemented (Story 2.5)
    // For now, any authenticated user can access (will be restricted in Story 2.5)
    return this.authService.getSecurityDashboard();
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all active sessions for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of active sessions',
    type: [SessionDto],
  })
  async getUserSessions(
    @Req() req: Request & { user: any },
  ): Promise<SessionDto[]> {
    const sessions = await this.authService.getAllUserSessions(req.user.userId);

    return sessions.map((session) => ({
      session_id: session.session_id,
      created_at: session.created_at,
      expires_at: session.expires_at,
      last_active: session.last_active || session.created_at,
      ip_address: session.ip_address,
      user_agent: session.user_agent,
      is_current: session.access_token_jti === req.user.jti,
    }));
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeSession(
    @Req() req: Request & { user: any },
    @Param('sessionId') sessionId: string,
  ): Promise<{ message: string }> {
    await this.authService.deleteSession(req.user.userId, sessionId);
    return { message: 'Session revoked successfully' };
  }

  @Delete('sessions/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Revoke all sessions except current one' })
  @ApiResponse({ status: 200, description: 'All other sessions revoked' })
  async revokeAllOtherSessions(
    @Req() req: Request & { user: any },
  ): Promise<{ message: string; revoked_count: number }> {
    const sessions = await this.authService.getAllUserSessions(req.user.userId);

    let revokedCount = 0;
    for (const session of sessions) {
      // Skip current session
      if (session.access_token_jti !== req.user.jti) {
        await this.authService.deleteSession(
          req.user.userId,
          session.session_id,
        );
        revokedCount++;
      }
    }

    return {
      message: 'All other sessions revoked successfully',
      revoked_count: revokedCount,
    };
  }
}
