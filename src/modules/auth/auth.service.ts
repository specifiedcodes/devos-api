import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService, TokenExpiredError, JsonWebTokenError } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThanOrEqual } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../../database/entities/user.entity';
import { BackupCode } from '../../database/entities/backup-code.entity';
import { AccountDeletion } from '../../database/entities/account-deletion.entity';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import {
  SecurityEvent,
  SecurityEventType,
} from '../../database/entities/security-event.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ProfileDto } from './dto/profile.dto';
import { SecurityDashboardDto } from './dto/security-dashboard.dto';
import { EmailAlreadyExistsException } from './exceptions/email-already-exists.exception';
import { RedisService } from '../redis/redis.service';
import { EncryptionService } from '../../shared/encryption/encryption.service';
import { Session } from './interfaces/session.interface';
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AuditService, AuditAction } from '../../shared/audit/audit.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_COST_FACTOR = 12; // Security requirement from AC
  private readonly ACCESS_TOKEN_EXPIRY = '24h';
  private readonly REFRESH_TOKEN_EXPIRY = '30d';

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(BackupCode)
    private backupCodeRepository: Repository<BackupCode>,
    @InjectRepository(AccountDeletion)
    private accountDeletionRepository: Repository<AccountDeletion>,
    @InjectRepository(SecurityEvent)
    private securityEventRepository: Repository<SecurityEvent>,
    @InjectRepository(WorkspaceMember)
    private workspaceMemberRepository: Repository<WorkspaceMember>,
    private jwtService: JwtService,
    private dataSource: DataSource,
    private redisService: RedisService,
    private encryptionService: EncryptionService,
    private anomalyDetectionService: AnomalyDetectionService,
    private workspacesService: WorkspacesService,
    private auditService: AuditService,
  ) {}

  /**
   * Get user profile for display (Story 1.9)
   * Returns profile information without sensitive fields
   */
  async getProfile(userId: string): Promise<ProfileDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'createdAt', 'lastLoginAt', 'twoFactorEnabled'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      created_at: user.createdAt,
      last_login_at: user.lastLoginAt,
      two_factor_enabled: user.twoFactorEnabled,
    };
  }

  /**
   * Change user password (Story 1.9)
   * Requires current password verification and invalidates all sessions
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<void> {
    // 1. Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      this.logger.warn(`Failed password change attempt for user: ${userId}`);
      throw new UnauthorizedException('Current password is incorrect');
    }

    // 3. Check new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    // 4. Hash new password
    const newPasswordHash = await bcrypt.hash(
      newPassword,
      this.BCRYPT_COST_FACTOR,
    );

    // 5. Update password in database
    user.passwordHash = newPasswordHash;
    await this.userRepository.save(user);

    // 6. Invalidate all existing refresh tokens (force re-login on all devices)
    await this.revokeAllUserTokens(userId);

    // 7. Log successful password change
    this.logger.log(`Password changed successfully for user: ${userId}`);

    // Log password changed security event
    await this.logSecurityEvent({
      user_id: userId,
      email: user.email,
      event_type: SecurityEventType.PASSWORD_CHANGED,
    });
  }

  /**
   * Revokes all refresh tokens for a user (used in password change and account deletion)
   * Clears all Redis sessions matching the user's session pattern
   */
  private async revokeAllUserTokens(userId: string): Promise<void> {
    // Get all user sessions
    const sessions = await this.getAllUserSessions(userId);

    // Add all tokens to blacklist
    for (const session of sessions) {
      await this.revokeToken(
        session.access_token_jti,
        new Date(session.expires_at),
      );
      await this.revokeToken(
        session.refresh_token_jti,
        new Date(session.expires_at),
      );
      await this.deleteSession(userId, session.session_id);
    }

    this.logger.log(`Revoked ${sessions.length} sessions for user: ${userId}`);
  }

  /**
   * Delete user account (Story 1.9 - GDPR compliance)
   * Soft delete with 30-day grace period before hard delete
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    // 1. Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Failed account deletion attempt for user: ${userId}`);
      throw new UnauthorizedException('Password is incorrect');
    }

    // 3. Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 4. Store original email before anonymization
      const originalEmail = user.email;

      // 5. Soft delete: Anonymize email and mark as deleted
      const anonymizedEmail = `deleted_${userId}@deleted.local`;
      user.email = anonymizedEmail;
      user.deletedAt = new Date();
      await queryRunner.manager.save(user);

      // 6. Create deletion record for background job (with original email for recovery check)
      const hardDeleteDate = new Date();
      hardDeleteDate.setDate(hardDeleteDate.getDate() + 30); // 30 days from now

      await queryRunner.manager.save(AccountDeletion, {
        user_id: userId,
        original_email: originalEmail,
        deleted_at: new Date(),
        hard_delete_scheduled_at: hardDeleteDate,
        completed: false,
      });

      // 7. Delete user-owned workspaces (cascade will handle projects)
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(Workspace)
        .where('owner_user_id = :userId', { userId })
        .execute();

      // 8. Delete workspace memberships
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(WorkspaceMember)
        .where('user_id = :userId', { userId })
        .execute();

      // 9. Delete backup codes
      await queryRunner.manager.delete(BackupCode, { userId });

      // 10. Commit transaction
      await queryRunner.commitTransaction();

      // 11. Revoke all sessions (outside transaction - non-critical)
      await this.revokeAllUserTokens(userId);

      // 12. Log account deletion
      this.logger.log(`Account soft deleted for user: ${userId}`);

      // Log account deleted security event
      await this.logSecurityEvent({
        user_id: userId,
        event_type: SecurityEventType.ACCOUNT_DELETED,
        metadata: { soft_delete: true, original_email: originalEmail },
      });
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Account deletion failed for user: ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  async register(
    registerDto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = registerDto.email.toLowerCase();

    // 1. Validate password confirmation matches
    if (registerDto.password !== registerDto.passwordConfirmation) {
      this.logger.warn(
        `Password confirmation mismatch for email: ${normalizedEmail}`,
      );
      throw new BadRequestException('Password confirmation does not match');
    }

    // 2. Check if email already exists (including soft-deleted accounts)
    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      this.logger.warn(
        `Duplicate email registration attempt: ${normalizedEmail}`,
      );
      throw new EmailAlreadyExistsException(normalizedEmail);
    }

    // 3. Check if email belongs to a recently deleted account (within grace period)
    const deletedAccountWithEmail = await this.accountDeletionRepository.findOne({
      where: {
        original_email: normalizedEmail,
        completed: false,
      },
    });

    if (deletedAccountWithEmail) {
      // Check if still within grace period
      const now = new Date();
      if (deletedAccountWithEmail.hard_delete_scheduled_at > now) {
        this.logger.warn(
          `Registration attempt with email from deleted account: ${normalizedEmail}`,
        );
        throw new BadRequestException(
          'This email is associated with a recently deleted account. Please contact support if you need assistance.',
        );
      }
    }

    // 4. Use transaction for user creation (zero data loss requirement)
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 5. Hash password with bcrypt (cost factor 12)
      const passwordHash = await bcrypt.hash(
        registerDto.password,
        this.BCRYPT_COST_FACTOR,
      );

      // 6. Create user record
      const user = this.userRepository.create({
        email: normalizedEmail,
        passwordHash: passwordHash,
        twoFactorEnabled: false,
      });

      const savedUser = await queryRunner.manager.save(user);

      // 7. Create default workspace (Story 2.1)
      const workspace = await this.workspacesService.createDefaultWorkspace(
        savedUser,
        queryRunner
      );

      // 7a. Set user's current workspace to the newly created workspace
      savedUser.currentWorkspaceId = workspace.id;
      await queryRunner.manager.save(savedUser);

      // 8. Commit transaction
      await queryRunner.commitTransaction();

      this.logger.log(
        `User registered successfully: ${savedUser.id} (${normalizedEmail}) with workspace: ${workspace.id}`,
      );

      // 9. Generate JWT tokens with session (including workspace_id)
      const tokens = await this.generateTokens(savedUser, ipAddress, userAgent, workspace.id);

      // 9a. Log successful registration security event
      await this.logSecurityEvent({
        user_id: savedUser.id,
        email: savedUser.email,
        event_type: SecurityEventType.LOGIN_SUCCESS,
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata: { registration: true, workspace_id: workspace.id },
      });

      // 10. Return formatted response
      return {
        user: {
          id: savedUser.id,
          email: savedUser.email,
          created_at: savedUser.createdAt.toISOString(),
        },
        tokens: {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          expires_in: 86400, // 24 hours in seconds
        },
      };
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `User registration failed: ${normalizedEmail}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  async login(
    loginDto: LoginDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthResponseDto | { requires_2fa: true; temp_token: string; backup_codes_remaining?: number }> {
    // 1. Find user by email (case-insensitive) with workspace relations
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email.toLowerCase() },
      relations: ['currentWorkspace', 'workspaceMembers'],
    });

    // 2. If user doesn't exist, throw generic error (don't reveal which field is wrong)
    if (!user) {
      this.logger.warn(
        `Failed login attempt for non-existent email: ${loginDto.email} from IP: ${ipAddress}`,
      );

      // Log failed login security event
      await this.logSecurityEvent({
        email: loginDto.email.toLowerCase(),
        event_type: SecurityEventType.LOGIN_FAILED,
        ip_address: ipAddress,
        user_agent: userAgent,
        reason: 'invalid_email',
      });

      // NOTE: Cannot log to audit_logs for non-existent users (no workspace context)
      // Security events table is used for these cases instead

      // Check for multiple failed attempts even for non-existent email
      const shouldLock = await this.anomalyDetectionService.detectMultipleFailedAttempts(
        loginDto.email,
        ipAddress,
      );

      if (shouldLock) {
        throw new UnauthorizedException(
          'Too many failed login attempts from this IP address. Please try again later.',
        );
      }

      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Compare password using bcrypt (constant-time algorithm prevents timing attacks)
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      this.logger.warn(
        `Failed login attempt for user ${user.id}: incorrect password from IP: ${ipAddress}`,
      );

      // Log failed login security event
      await this.logSecurityEvent({
        user_id: user.id,
        email: user.email,
        event_type: SecurityEventType.LOGIN_FAILED,
        ip_address: ipAddress,
        user_agent: userAgent,
        reason: 'invalid_password',
      });

      // Log to audit logs if user has a workspace (Task 6.3: LOGIN_FAILED audit logging)
      if (user.currentWorkspaceId) {
        try {
          await this.auditService.log(
            user.currentWorkspaceId,
            user.id,
            AuditAction.LOGIN_FAILED,
            'auth',
            user.id,
            {
              reason: 'invalid_password',
              email: user.email,
            },
            ipAddress,
            userAgent,
          );
        } catch (error) {
          // Don't fail login flow if audit logging fails
          this.logger.error(`Failed to log LOGIN_FAILED audit event: ${error.message}`);
        }
      }

      // Check for multiple failed attempts and trigger account lockout if needed
      const shouldLock = await this.anomalyDetectionService.detectMultipleFailedAttempts(
        user.email,
        ipAddress,
      );

      if (shouldLock) {
        throw new UnauthorizedException(
          'Account temporarily locked due to multiple failed login attempts. Please try again later.',
        );
      }

      throw new UnauthorizedException('Invalid email or password');
    }

    // 4. Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      // Generate temporary verification token
      const tempToken = await this.redisService.createTempToken(user.id, {
        ip_address: ipAddress,
        user_agent: userAgent,
        created_at: new Date().toISOString(),
      });

      this.logger.log(`2FA verification required for user: ${user.id}`);

      // Get remaining backup codes count
      const backupCodesRemaining = await this.getBackupCodesCount(user.id);

      return {
        requires_2fa: true,
        temp_token: tempToken,
        backup_codes_remaining: backupCodesRemaining,
      };
    }

    // 5. Determine workspace for this session
    let workspaceId = user.currentWorkspaceId;

    if (!workspaceId) {
      // First login or currentWorkspaceId is null - get user's first workspace
      const firstMembership = await this.workspaceMemberRepository.findOne({
        where: { userId: user.id },
        order: { createdAt: 'ASC' },
      });

      if (firstMembership) {
        workspaceId = firstMembership.workspaceId;
        // Update user's currentWorkspaceId for future logins
        await this.userRepository.update(user.id, {
          currentWorkspaceId: workspaceId,
        });
        user.currentWorkspaceId = workspaceId;
      } else {
        this.logger.error(`User ${user.id} has no workspaces - this should not happen`);
        throw new InternalServerErrorException('User has no workspaces');
      }
    }

    // 6. If no 2FA, proceed with standard JWT flow with workspace context
    const tokens = await this.generateTokens(user, ipAddress, userAgent, workspaceId);

    // 7. Update last_login_at timestamp atomically after successful token generation
    // Use try-catch to ensure we still return tokens even if timestamp update fails
    try {
      await this.userRepository.update(user.id, {
        lastLoginAt: new Date(),
      });
    } catch (updateError: unknown) {
      // Log error but don't fail the login - user already authenticated
      const errorMessage =
        updateError instanceof Error
          ? updateError.message
          : 'Unknown error';
      this.logger.error(
        `Failed to update lastLoginAt for user ${user.id}: ${errorMessage}`,
      );
    }

    // 8. Log successful login (for security monitoring)
    this.logger.log(
      `Successful login for user ${user.id} (${user.email}) from IP: ${ipAddress}, User-Agent: ${userAgent}, Workspace: ${workspaceId}`,
    );

    // 8a. Log successful login security event
    await this.logSecurityEvent({
      user_id: user.id,
      email: user.email,
      event_type: SecurityEventType.LOGIN_SUCCESS,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: { workspace_id: workspaceId },
    });

    // 8b. Detect login anomalies (new country, etc.) - non-blocking
    this.anomalyDetectionService
      .detectLoginAnomaly(user.id, ipAddress, user.email)
      .catch((error) => {
        this.logger.error(
          `Anomaly detection failed for user ${user.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      });

    // 9. Return formatted response
    return {
      user: {
        id: user.id,
        email: user.email,
        created_at: user.createdAt.toISOString(),
      },
      tokens: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: 86400, // 24 hours in seconds
      },
    };
  }

  private async generateTokens(
    user: User,
    ipAddress?: string,
    userAgent?: string,
    workspaceId?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    accessTokenJti: string;
    refreshTokenJti: string;
  }> {
    // Generate unique JTIs for both tokens
    const accessTokenJti = uuidv4();
    const refreshTokenJti = uuidv4();

    const payload = {
      sub: user.id,
      email: user.email,
      jti: accessTokenJti,
      workspaceId: workspaceId || user.currentWorkspaceId,
      // Note: iat (issued at) and exp (expiry) are added automatically by JWT service
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    const refreshPayload = {
      sub: user.id,
      jti: refreshTokenJti,
      workspaceId: workspaceId || user.currentWorkspaceId,
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
    });

    // Create session in Redis if IP and user agent provided
    if (ipAddress && userAgent) {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await this.createSession(
        user.id,
        workspaceId || user.currentWorkspaceId || '',
        accessTokenJti,
        refreshTokenJti,
        ipAddress,
        userAgent,
        expiresAt,
      );
    }

    return { accessToken, refreshToken, accessTokenJti, refreshTokenJti };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResponseDto> {
    try {
      // 1. Verify refresh token signature and expiry
      const payload = this.jwtService.verify(refreshToken) as {
        sub: string;
        email: string;
      };

      // 2. Check if token is blacklisted (logged out)
      const isBlacklisted =
        await this.redisService.isTokenBlacklisted(refreshToken);
      if (isBlacklisted) {
        this.logger.warn(`Blacklisted refresh token used: ${payload.sub}`);
        throw new UnauthorizedException('Token has been invalidated');
      }

      // 3. Find user by ID from token payload
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        this.logger.warn(`User not found for refresh token: ${payload.sub}`);
        throw new UnauthorizedException('User not found');
      }

      // 4. Generate new access token
      const newAccessToken = this.jwtService.sign(
        { sub: user.id, email: user.email },
        { expiresIn: this.ACCESS_TOKEN_EXPIRY },
      );

      // 5. Optionally rotate refresh token (security best practice)
      const newRefreshToken = this.jwtService.sign(
        { sub: user.id, email: user.email },
        { expiresIn: this.REFRESH_TOKEN_EXPIRY },
      );

      // 6. If rotating, blacklist old refresh token
      if (newRefreshToken !== refreshToken) {
        await this.redisService.blacklistToken(refreshToken, 30 * 24 * 60 * 60); // 30 days TTL
      }

      this.logger.log(`Access token refreshed for user: ${user.id}`);

      return {
        user: {
          id: user.id,
          email: user.email,
          created_at: user.createdAt.toISOString(),
        },
        tokens: {
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_in: 86400, // 24 hours
        },
      };
    } catch (error) {
      if (
        error instanceof JsonWebTokenError ||
        error instanceof TokenExpiredError
      ) {
        this.logger.warn('Invalid or expired refresh token');
        throw new UnauthorizedException('Session expired, please log in again');
      }
      throw error;
    }
  }

  async blacklistToken(token: string, ttlSeconds: number): Promise<void> {
    try {
      // Decode token to get JTI (JWT ID) if present, or use token itself
      const decoded = this.jwtService.decode(token) as { jti?: string } | null;
      const key = decoded?.jti || token;

      await this.redisService.blacklistToken(key, ttlSeconds);
      this.logger.debug(`Token blacklisted: ${key.substring(0, 10)}...`);
    } catch (error) {
      this.logger.error('Failed to blacklist token', error);
      // Don't throw - logout should succeed even if blacklist fails
    }
  }

  /**
   * Enable 2FA for a user - generates TOTP secret, QR code, and backup codes
   */
  async enable2FA(userId: string): Promise<{
    qrCode: string;
    secret: string;
    backupCodes: string[];
  }> {
    // 1. Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Check if 2FA already enabled
    if (user.twoFactorEnabled) {
      throw new BadRequestException(
        '2FA is already enabled for this account',
      );
    }

    // 3. Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `DevOS (${user.email})`,
      issuer: 'DevOS',
      length: 32, // 160-bit secret
    });

    if (!secret.base32) {
      throw new InternalServerErrorException('Failed to generate 2FA secret');
    }

    // 4. Encrypt secret before storing
    const encryptedSecret = this.encryptionService.encrypt(secret.base32);

    // 5. Store encrypted secret (but don't enable yet - wait for verification)
    user.twoFactorSecret = encryptedSecret;
    await this.userRepository.save(user);

    // 6. Generate QR code
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url || '');

    // 7. Generate 10 backup codes
    const backupCodes = await this.generateBackupCodes(userId);

    this.logger.log(`2FA setup initiated for user: ${userId}`);

    return {
      qrCode: qrCodeDataUrl,
      secret: secret.base32,
      backupCodes,
    };
  }

  /**
   * Verify 2FA setup with code from authenticator app
   */
  async verify2FASetup(userId: string, code: string): Promise<void> {
    // 1. Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Check if secret exists
    if (!user.twoFactorSecret) {
      throw new BadRequestException(
        '2FA setup not initiated. Call /2fa/enable first',
      );
    }

    // 3. Decrypt secret
    const secret = this.encryptionService.decrypt(user.twoFactorSecret);

    // 4. Verify code using speakeasy
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1, // Allow 1 step (30 seconds) of clock drift
    });

    if (!isValid) {
      this.logger.warn(`Invalid 2FA verification code for user: ${userId}`);
      throw new UnauthorizedException('Invalid verification code');
    }

    // 5. Enable 2FA on account
    user.twoFactorEnabled = true;
    await this.userRepository.save(user);

    this.logger.log(`2FA enabled successfully for user: ${userId}`);

    // Log 2FA enabled security event
    await this.logSecurityEvent({
      user_id: userId,
      email: user.email,
      event_type: SecurityEventType.TWO_FACTOR_ENABLED,
    });
  }

  /**
   * Disable 2FA for a user (requires password verification)
   */
  async disable2FA(userId: string, password: string): Promise<void> {
    // 1. Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Check if 2FA is enabled
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled for this account');
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(
        `Failed 2FA disable attempt for user: ${userId} (invalid password)`,
      );
      throw new UnauthorizedException('Invalid password');
    }

    // 4. Disable 2FA
    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await this.userRepository.save(user);

    // 5. Delete all backup codes
    await this.backupCodeRepository.delete({ userId });

    // 6. Log security event
    this.logger.log(`2FA disabled for user: ${userId}`);

    // Log 2FA disabled security event
    await this.logSecurityEvent({
      user_id: userId,
      email: user.email,
      event_type: SecurityEventType.TWO_FACTOR_DISABLED,
    });
  }

  /**
   * Regenerate backup codes (requires password verification)
   */
  async regenerateBackupCodes(
    userId: string,
    password: string,
  ): Promise<string[]> {
    // 1. Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Check if 2FA is enabled
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled for this account');
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(
        `Failed backup code regeneration for user: ${userId} (invalid password)`,
      );
      throw new UnauthorizedException('Invalid password');
    }

    // 4. Delete all existing backup codes
    await this.backupCodeRepository.delete({ userId });

    // 5. Generate new backup codes
    const newBackupCodes = await this.generateBackupCodes(userId);

    this.logger.log(`Backup codes regenerated for user: ${userId}`);

    return newBackupCodes;
  }

  /**
   * Verify 2FA TOTP code during login
   */
  async verify2FA(
    tempToken: string,
    code: string,
  ): Promise<AuthResponseDto> {
    // 1. Validate temp token
    const tokenData = await this.redisService.validateTempToken(tempToken);
    if (!tokenData) {
      throw new UnauthorizedException(
        'Verification timeout, please log in again',
      );
    }

    // 2. Find user
    const user = await this.userRepository.findOne({
      where: { id: tokenData.user_id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 3. Check 2FA is still enabled
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA is not enabled for this account');
    }

    // 4. Decrypt TOTP secret
    const secret = this.encryptionService.decrypt(user.twoFactorSecret);

    // 5. Verify TOTP code
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1, // Allow ±30 seconds for clock drift
    });

    if (!isValid) {
      this.logger.warn(
        `Invalid 2FA code for user: ${user.id}, IP: ${tokenData.ip_address}`,
      );

      // Log failed 2FA verification security event
      await this.logSecurityEvent({
        user_id: user.id,
        event_type: SecurityEventType.TWO_FACTOR_FAILED,
        ip_address: tokenData.ip_address,
        user_agent: tokenData.user_agent,
      });

      throw new UnauthorizedException('Incorrect code, please try again');
    }

    // 6. Delete temp token IMMEDIATELY (prevent replay attacks)
    await this.redisService.deleteTempToken(tempToken);

    // 6a. Determine workspace for this session (same logic as login)
    let workspaceId = user.currentWorkspaceId;

    if (!workspaceId) {
      const firstMembership = await this.workspaceMemberRepository.findOne({
        where: { userId: user.id },
        order: { createdAt: 'ASC' },
      });

      if (firstMembership) {
        workspaceId = firstMembership.workspaceId;
        await this.userRepository.update(user.id, {
          currentWorkspaceId: workspaceId,
        });
      } else {
        throw new InternalServerErrorException('User has no workspaces');
      }
    }

    // 7. Generate JWT tokens with workspace context
    const tokens = await this.generateTokens(
      user,
      tokenData.ip_address,
      tokenData.user_agent,
      workspaceId,
    );

    // 8. Update last login timestamp (non-critical, don't fail if this fails)
    try {
      await this.userRepository.update(user.id, {
        lastLoginAt: new Date(),
      });
    } catch (updateError: unknown) {
      const errorMessage =
        updateError instanceof Error
          ? updateError.message
          : 'Unknown error';
      this.logger.error(
        `Failed to update lastLoginAt for user ${user.id}: ${errorMessage}`,
      );
    }

    // 9. Log successful 2FA login
    this.logger.log(`2FA verification successful for user: ${user.id}`);

    // Log successful 2FA verification security event
    await this.logSecurityEvent({
      user_id: user.id,
      email: user.email,
      event_type: SecurityEventType.TWO_FACTOR_VERIFIED,
      ip_address: tokenData.ip_address,
      user_agent: tokenData.user_agent,
      metadata: { workspace_id: workspaceId },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        created_at: user.createdAt.toISOString(),
      },
      tokens: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: 86400, // 24 hours in seconds
      },
    };
  }

  /**
   * Verify 2FA backup code during login
   */
  async verify2FABackup(
    tempToken: string,
    backupCode: string,
  ): Promise<AuthResponseDto & { backup_codes_remaining?: number }> {
    // 1. Validate temp token
    const tokenData = await this.redisService.validateTempToken(tempToken);
    if (!tokenData) {
      throw new UnauthorizedException(
        'Verification timeout, please log in again',
      );
    }

    // 2. Find user
    const user = await this.userRepository.findOne({
      where: { id: tokenData.user_id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 3. Hash provided backup code
    const codeHash = this.encryptionService.hash(backupCode.toUpperCase());

    // 4. Find matching unused backup code
    const backupCodeEntity = await this.backupCodeRepository.findOne({
      where: {
        userId: user.id,
        codeHash,
        used: false,
      },
    });

    if (!backupCodeEntity) {
      this.logger.warn(
        `Invalid or used backup code for user: ${user.id}, IP: ${tokenData.ip_address}`,
      );
      // TODO: Log security audit event for failed backup code verification
      // await this.securityAuditService.logEvent({
      //   event_type: 'backup_code_verification_failed',
      //   user_id: user.id,
      //   ip_address: tokenData.ip_address,
      //   timestamp: new Date(),
      // });
      throw new UnauthorizedException('Invalid backup code');
    }

    // 5. Mark backup code as used
    backupCodeEntity.used = true;
    await this.backupCodeRepository.save(backupCodeEntity);

    // 6. Delete temp token IMMEDIATELY (prevent replay attacks)
    await this.redisService.deleteTempToken(tempToken);

    // 6a. Determine workspace for this session (same logic as login)
    let workspaceId = user.currentWorkspaceId;

    if (!workspaceId) {
      const firstMembership = await this.workspaceMemberRepository.findOne({
        where: { userId: user.id },
        order: { createdAt: 'ASC' },
      });

      if (firstMembership) {
        workspaceId = firstMembership.workspaceId;
        await this.userRepository.update(user.id, {
          currentWorkspaceId: workspaceId,
        });
      } else {
        throw new InternalServerErrorException('User has no workspaces');
      }
    }

    // 7. Generate JWT tokens with workspace context
    const tokens = await this.generateTokens(
      user,
      tokenData.ip_address,
      tokenData.user_agent,
      workspaceId,
    );

    // 8. Update last login timestamp (non-critical, don't fail if this fails)
    try {
      await this.userRepository.update(user.id, {
        lastLoginAt: new Date(),
      });
    } catch (updateError: unknown) {
      const errorMessage =
        updateError instanceof Error
          ? updateError.message
          : 'Unknown error';
      this.logger.error(
        `Failed to update lastLoginAt for user ${user.id}: ${errorMessage}`,
      );
    }

    // 9. Log successful backup code login
    this.logger.log(`Backup code verification successful for user: ${user.id}`);

    // Log successful backup code verification security event
    await this.logSecurityEvent({
      user_id: user.id,
      email: user.email,
      event_type: SecurityEventType.TWO_FACTOR_VERIFIED,
      ip_address: tokenData.ip_address,
      user_agent: tokenData.user_agent,
      metadata: { backup_code_used: true, workspace_id: workspaceId },
    });

    // 10. Check remaining backup codes and warn user
    const remainingCodes = await this.backupCodeRepository.count({
      where: { userId: user.id, used: false },
    });
    if (remainingCodes === 0) {
      this.logger.warn(`User ${user.id} has no remaining backup codes`);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        created_at: user.createdAt.toISOString(),
      },
      tokens: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: 86400, // 24 hours in seconds
      },
      backup_codes_remaining: remainingCodes,
    };
  }

  /**
   * Helper method to get unused backup codes count
   */
  private async getBackupCodesCount(userId: string): Promise<number> {
    return await this.backupCodeRepository.count({
      where: { userId, used: false },
    });
  }

  /**
   * Generates 10 random backup codes with collision prevention
   */
  private async generateBackupCodes(userId: string): Promise<string[]> {
    const codes: string[] = [];
    const backupCodeEntities: BackupCode[] = [];
    const maxRetries = 50; // Prevent infinite loops

    // Generate 10 unique codes
    for (let i = 0; i < 10; i++) {
      let code: string;
      let codeHash: string;
      let attempts = 0;
      let isUnique = false;

      // Keep generating until we get a unique code
      while (!isUnique && attempts < maxRetries) {
        // Generate random alphanumeric code (10 characters from 8 random bytes for better entropy)
        code = crypto
          .randomBytes(8)
          .toString('hex')
          .substring(0, 10)
          .toUpperCase();

        // Hash code before storing
        codeHash = this.encryptionService.hash(code);

        // Check if this hash already exists in database (global collision check)
        const existingCode = await this.backupCodeRepository.findOne({
          where: { codeHash },
        });

        // Also check if we already generated this code in current batch
        const duplicateInBatch = codes.includes(code);

        if (!existingCode && !duplicateInBatch) {
          isUnique = true;
          codes.push(code);

          // Create backup code entity
          const backupCode = this.backupCodeRepository.create({
            userId,
            codeHash,
            used: false,
          });
          backupCodeEntities.push(backupCode);
        }

        attempts++;
      }

      if (!isUnique) {
        this.logger.error(
          `Failed to generate unique backup code after ${maxRetries} attempts`,
        );
        throw new InternalServerErrorException(
          'Failed to generate unique backup codes',
        );
      }
    }

    // Save all backup codes
    await this.backupCodeRepository.save(backupCodeEntities);

    this.logger.debug(`Generated 10 backup codes for user: ${userId}`);

    return codes;
  }

  // ============================================================================
  // SESSION MANAGEMENT & SECURITY MONITORING (Story 1.10)
  // ============================================================================

  /**
   * Log security event to database
   */
  async logSecurityEvent(eventData: {
    user_id?: string;
    email?: string;
    event_type: SecurityEventType;
    ip_address?: string;
    user_agent?: string;
    metadata?: Record<string, any>;
    reason?: string;
  }): Promise<void> {
    try {
      const event = this.securityEventRepository.create({
        user_id: eventData.user_id,
        email: eventData.email,
        event_type: eventData.event_type,
        ip_address: eventData.ip_address,
        user_agent: eventData.user_agent,
        metadata: eventData.metadata,
        reason: eventData.reason,
      });

      await this.securityEventRepository.save(event);

      this.logger.log(
        `Security event logged: ${eventData.event_type} for ${eventData.user_id || eventData.email}`,
      );
    } catch (error) {
      // Don't fail the main operation if logging fails
      this.logger.error(
        `Failed to log security event: ${eventData.event_type}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Create a new session in Redis
   */
  async createSession(
    userId: string,
    workspaceId: string,
    accessTokenJti: string,
    refreshTokenJti: string,
    ipAddress: string,
    userAgent: string,
    expiresAt: Date,
  ): Promise<string> {
    const sessionId = uuidv4();
    const session: Session = {
      session_id: sessionId,
      user_id: userId,
      workspace_id: workspaceId,
      access_token_jti: accessTokenJti,
      refresh_token_jti: refreshTokenJti,
      created_at: new Date(),
      expires_at: expiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
      last_active: new Date(),
    };

    // Store in Redis with TTL matching token expiration
    const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    await this.redisService.set(
      `session:${userId}:${sessionId}`,
      JSON.stringify(session),
      ttlSeconds,
    );

    // Log session creation
    await this.logSecurityEvent({
      user_id: userId,
      event_type: SecurityEventType.SESSION_CREATED,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: { session_id: sessionId, workspace_id: workspaceId },
    });

    return sessionId;
  }

  /**
   * Get session by token JTI
   */
  async getSessionByTokenJti(userId: string, jti: string): Promise<Session | null> {
    const sessionKeys = await this.redisService.keys(`session:${userId}:*`);

    for (const key of sessionKeys) {
      const sessionData = await this.redisService.get(key);
      if (sessionData) {
        const session: Session = JSON.parse(sessionData);
        if (
          session.access_token_jti === jti ||
          session.refresh_token_jti === jti
        ) {
          return session;
        }
      }
    }

    return null;
  }

  /**
   * Get all active sessions for a user
   */
  async getAllUserSessions(userId: string): Promise<Session[]> {
    const sessionKeys = await this.redisService.keys(`session:${userId}:*`);
    const sessions: Session[] = [];

    for (const key of sessionKeys) {
      const sessionData = await this.redisService.get(key);
      if (sessionData) {
        sessions.push(JSON.parse(sessionData));
      }
    }

    // Sort by created_at descending (newest first)
    return sessions.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  /**
   * Delete a specific session (for logout or session revocation)
   */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    // 1. Get session data BEFORE deleting to revoke tokens
    const sessionData = await this.redisService.get(`session:${userId}:${sessionId}`);

    if (sessionData) {
      const session: Session = JSON.parse(sessionData);

      // 2. Revoke both access and refresh tokens
      await this.revokeToken(session.access_token_jti, new Date(session.expires_at));
      await this.revokeToken(session.refresh_token_jti, new Date(session.expires_at));
    }

    // 3. Delete session from Redis
    await this.redisService.del(`session:${userId}:${sessionId}`);

    // 4. Log session deletion event
    await this.logSecurityEvent({
      user_id: userId,
      event_type: SecurityEventType.SESSION_DELETED,
      metadata: { session_id: sessionId },
    });
  }

  /**
   * Update session last_active timestamp
   */
  async updateSessionActivity(userId: string, jti: string): Promise<void> {
    const session = await this.getSessionByTokenJti(userId, jti);
    if (session) {
      session.last_active = new Date();
      const ttlSeconds = Math.floor(
        (new Date(session.expires_at).getTime() - Date.now()) / 1000,
      );
      await this.redisService.set(
        `session:${userId}:${session.session_id}`,
        JSON.stringify(session),
        ttlSeconds,
      );
    }
  }

  /**
   * Add token to blacklist (revoke it)
   */
  async revokeToken(jti: string, expiresAt: Date): Promise<void> {
    const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    if (ttlSeconds > 0) {
      await this.redisService.set(`blacklist:${jti}`, 'revoked', ttlSeconds);
    }

    await this.logSecurityEvent({
      event_type: SecurityEventType.TOKEN_REVOKED,
      metadata: { jti },
    });
  }

  /**
   * Check if token is revoked
   */
  async isTokenRevoked(jti: string): Promise<boolean> {
    const result = await this.redisService.get(`blacklist:${jti}`);
    return result === 'revoked';
  }

  /**
   * Get security dashboard metrics (admin only)
   */
  async getSecurityDashboard(): Promise<SecurityDashboardDto> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Failed login rate
    const failedLogins = await this.securityEventRepository.count({
      where: {
        event_type: SecurityEventType.LOGIN_FAILED,
        created_at: MoreThanOrEqual(twentyFourHoursAgo),
      },
    });
    const failedLoginRate = failedLogins / 24; // per hour

    // Active sessions count
    const allSessionKeys = await this.redisService.keys('session:*');
    const activeSessionsCount = allSessionKeys.length;

    // 2FA adoption rate
    const totalUsers = await this.userRepository.count();
    const twoFactorEnabledUsers = await this.userRepository.count({
      where: { twoFactorEnabled: true },
    });
    const twoFactorAdoptionRate =
      totalUsers > 0 ? (twoFactorEnabledUsers / totalUsers) * 100 : 0;

    // Account lockouts
    const accountLockouts = await this.securityEventRepository.count({
      where: {
        event_type: SecurityEventType.ANOMALY_DETECTED,
        reason: 'multiple_failed_attempts',
        created_at: MoreThanOrEqual(twentyFourHoursAgo),
      },
    });

    // Deleted accounts
    const deletedAccounts = await this.accountDeletionRepository.count({
      where: {
        deleted_at: MoreThanOrEqual(thirtyDaysAgo),
      },
    });

    return {
      failed_login_rate: Math.round(failedLoginRate * 100) / 100,
      total_failed_logins: failedLogins,
      active_sessions_count: activeSessionsCount,
      two_factor_adoption_rate: Math.round(twoFactorAdoptionRate * 100) / 100,
      account_lockouts: accountLockouts,
      deleted_accounts: deletedAccounts,
      generated_at: new Date(),
    };
  }
}
