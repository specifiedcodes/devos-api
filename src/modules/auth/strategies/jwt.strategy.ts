import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(WorkspaceMember)
    private workspaceMemberRepository: Repository<WorkspaceMember>,
    private redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
      passReqToCallback: true, // Pass request to validate method
    } as any); // Type assertion needed for passReqToCallback
  }

  async validate(
    request: any,
    payload: { sub: string; email: string; jti?: string; workspaceId?: string },
  ): Promise<any> {
    const { sub: userId, jti, workspaceId } = payload;

    // 1. Check if token is revoked by JTI (Story 1.10)
    if (jti) {
      const result = await this.redisService.get(`blacklist:${jti}`);
      if (result === 'revoked') {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    // 2. Legacy blacklist check for tokens without JTI
    const token = request.headers.authorization?.split(' ')[1];
    if (token) {
      const isBlacklisted = await this.redisService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been invalidated');
      }
    }

    // 3. Find user by ID from token payload
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['currentWorkspace'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 3a. Check if user is suspended (Story 14.6)
    if (user.suspendedAt) {
      throw new UnauthorizedException('Account has been suspended');
    }

    // 4. Validate workspace access if workspaceId in token
    if (workspaceId) {
      // Verify user is still member of this workspace
      const member = await this.workspaceMemberRepository.findOne({
        where: { userId, workspaceId },
      });

      if (!member) {
        throw new UnauthorizedException('No longer a member of this workspace');
      }
    }

    // 5. Update session activity (non-blocking)
    if (jti) {
      // Don't await to avoid blocking request
      this.updateSessionActivity(userId, jti).catch((error) => {
        // Silently fail - session activity update is non-critical
      });
    }

    // 6. Return user object with workspace context and JTI (attached to request.user)
    return {
      userId,
      jti,
      workspaceId: workspaceId || user.currentWorkspaceId,
      ...user,
      isPlatformAdmin: user.isPlatformAdmin || false,
    };
  }

  private async updateSessionActivity(
    userId: string,
    jti: string,
  ): Promise<void> {
    try {
      const sessionKeys = await this.redisService.keys(`session:${userId}:*`);

      for (const key of sessionKeys) {
        const sessionData = await this.redisService.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (
            session.access_token_jti === jti ||
            session.refresh_token_jti === jti
          ) {
            session.last_active = new Date();
            const ttlSeconds = Math.floor(
              (new Date(session.expires_at).getTime() - Date.now()) / 1000,
            );
            if (ttlSeconds > 0) {
              await this.redisService.set(
                key,
                JSON.stringify(session),
                ttlSeconds,
              );
            }
            break;
          }
        }
      }
    } catch (error) {
      // Silently fail - session activity update is non-critical
    }
  }
}
