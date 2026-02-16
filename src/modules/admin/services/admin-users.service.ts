import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { Project } from '../../../database/entities/project.entity';
import { SecurityEvent, SecurityEventType } from '../../../database/entities/security-event.entity';
import { RedisService } from '../../redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import {
  PaginatedUsersResultDto,
  AdminUserDetailDto,
  AdminUserListItemDto,
} from '../dto/admin-user.dto';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  async listUsers(query: ListUsersQueryDto): Promise<PaginatedUsersResultDto> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const offset = (page - 1) * limit;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.isPlatformAdmin',
        'user.twoFactorEnabled',
        'user.createdAt',
        'user.lastLoginAt',
        'user.deletedAt',
        'user.suspendedAt',
      ]);

    // Add workspace count subquery
    qb.addSelect(
      (subQuery) =>
        subQuery
          .select('COUNT(wm.id)')
          .from(WorkspaceMember, 'wm')
          .where('wm.userId = user.id'),
      'workspaceCount',
    );

    // Search filter
    if (query.search) {
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          query.search,
        );
      if (isUUID) {
        qb.andWhere('user.id = :searchId', { searchId: query.search });
      } else {
        // Escape SQL ILIKE wildcards to prevent pattern injection
        const escapedSearch = query.search
          .replace(/\\/g, '\\\\')
          .replace(/%/g, '\\%')
          .replace(/_/g, '\\_');
        qb.andWhere('user.email ILIKE :searchEmail', {
          searchEmail: `%${escapedSearch}%`,
        });
      }
    }

    // Status filter
    if (query.status) {
      switch (query.status) {
        case 'active':
          qb.andWhere('user.deletedAt IS NULL');
          qb.andWhere('user.suspendedAt IS NULL');
          break;
        case 'suspended':
          qb.andWhere('user.suspendedAt IS NOT NULL');
          break;
        case 'deleted':
          qb.andWhere('user.deletedAt IS NOT NULL');
          break;
      }
    }

    // Date range filters
    if (query.registeredAfter) {
      qb.andWhere('user.createdAt >= :registeredAfter', {
        registeredAfter: query.registeredAfter,
      });
    }

    if (query.registeredBefore) {
      qb.andWhere('user.createdAt <= :registeredBefore', {
        registeredBefore: query.registeredBefore,
      });
    }

    // Sorting
    const sortColumn = this.getSortColumn(query.sortBy || 'createdAt');
    const sortOrder =
      (query.sortOrder?.toUpperCase() as 'ASC' | 'DESC') || 'DESC';
    qb.orderBy(sortColumn, sortOrder);

    // Get total count
    const total = await qb.getCount();

    // Get paginated results
    const rawResults = await qb.offset(offset).limit(limit).getRawAndEntities();

    // Map results
    const users: AdminUserListItemDto[] = rawResults.entities.map(
      (user, index) => ({
        id: user.id,
        email: user.email,
        isPlatformAdmin: user.isPlatformAdmin,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt?.toISOString() || '',
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
        status: this.deriveStatus(user),
        workspaceCount: parseInt(
          rawResults.raw[index]?.workspaceCount || '0',
          10,
        ),
      }),
    );

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserDetail(userId: string, adminId?: string): Promise<AdminUserDetailDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get workspaces with roles
    const workspaceMembers = await this.workspaceMemberRepository.find({
      where: { userId },
      relations: ['workspace'],
    });

    const workspaces = workspaceMembers.map((wm) => ({
      id: wm.workspaceId,
      name: wm.workspace?.name || 'Unknown',
      role: wm.role,
      joinedAt: wm.createdAt?.toISOString() || '',
    }));

    // Get project count across all user workspaces
    const workspaceIds = workspaceMembers.map((wm) => wm.workspaceId);
    let projectCount = 0;
    if (workspaceIds.length > 0) {
      projectCount = await this.projectRepository
        .createQueryBuilder('project')
        .where('project.workspaceId IN (:...workspaceIds)', { workspaceIds })
        .andWhere('project.createdByUserId = :userId', { userId })
        .getCount();
    }

    // Get recent security events (last 10)
    const securityEvents = await this.securityEventRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 10,
    });

    const totalSecurityEvents = await this.securityEventRepository.count({
      where: { user_id: userId },
    });

    const loginEvents = securityEvents.filter(
      (e) => e.event_type === SecurityEventType.LOGIN_SUCCESS,
    );
    const totalLogins = await this.securityEventRepository.count({
      where: { user_id: userId, event_type: SecurityEventType.LOGIN_SUCCESS },
    });

    const lastLoginEvent = loginEvents[0];

    // Get active session count from Redis
    const activeSessions = await this.getActiveSessionCount(userId);

    // Log admin view action
    await this.auditService.log(
      'platform',
      adminId || userId,
      AuditAction.ADMIN_USER_VIEWED,
      'user',
      userId,
      { action: 'admin_user_detail_view', adminId: adminId || userId, targetUserId: userId },
    );

    return {
      id: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt?.toISOString() || '',
      lastLoginAt: user.lastLoginAt?.toISOString() || null,
      status: this.deriveStatus(user),
      suspendedAt: user.suspendedAt?.toISOString() || null,
      suspensionReason: user.suspensionReason || null,
      workspaces,
      projectCount,
      activitySummary: {
        totalLogins,
        lastLoginIp: lastLoginEvent?.ip_address || null,
        totalSecurityEvents,
        recentActions: securityEvents.map((e) => ({
          action: e.event_type,
          timestamp: e.created_at?.toISOString() || '',
          ipAddress: e.ip_address || null,
        })),
      },
      activeSessions,
    };
  }

  async suspendUser(
    userId: string,
    adminId: string,
    reason: string,
    request?: any,
  ): Promise<void> {
    // Prevent self-suspend
    if (userId === adminId) {
      throw new BadRequestException('Cannot suspend your own account');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.suspendedAt) {
      throw new BadRequestException('User is already suspended');
    }

    if (user.isPlatformAdmin) {
      throw new ForbiddenException('Cannot suspend another platform administrator');
    }

    // Set suspension
    user.suspendedAt = new Date();
    user.suspensionReason = reason;
    await this.userRepository.save(user);

    // Revoke all active sessions
    const revokedCount = await this.revokeAllSessions(userId);

    // Log audit action
    await this.auditService.log(
      'platform',
      adminId,
      AuditAction.ADMIN_USER_SUSPENDED,
      'user',
      userId,
      {
        reason,
        revokedSessions: revokedCount,
        ipAddress: request?.ip,
        userAgent: request?.headers?.['user-agent'],
      },
    );

    this.logger.log(
      `User ${userId} suspended by admin ${adminId}. Reason: ${reason}. Sessions revoked: ${revokedCount}`,
    );
  }

  async unsuspendUser(
    userId: string,
    adminId: string,
    request?: any,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.suspendedAt) {
      throw new BadRequestException('User is not suspended');
    }

    // Clear suspension
    user.suspendedAt = null;
    user.suspensionReason = null;
    await this.userRepository.save(user);

    // Log audit action
    await this.auditService.log(
      'platform',
      adminId,
      AuditAction.ADMIN_USER_UNSUSPENDED,
      'user',
      userId,
      {
        ipAddress: request?.ip,
        userAgent: request?.headers?.['user-agent'],
      },
    );

    this.logger.log(`User ${userId} unsuspended by admin ${adminId}`);
  }

  async deleteUser(
    userId: string,
    adminId: string,
    reason: string,
    request?: any,
  ): Promise<void> {
    // Prevent self-delete
    if (userId === adminId) {
      throw new BadRequestException('Cannot delete your own account');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.deletedAt) {
      throw new BadRequestException('User is already deleted');
    }

    if (user.isPlatformAdmin) {
      throw new ForbiddenException('Cannot delete another platform administrator');
    }

    // Soft delete
    user.deletedAt = new Date();
    await this.userRepository.save(user);

    // Revoke all active sessions
    const revokedCount = await this.revokeAllSessions(userId);

    // Log audit action
    await this.auditService.log(
      'platform',
      adminId,
      AuditAction.ADMIN_USER_DELETED,
      'user',
      userId,
      {
        reason,
        revokedSessions: revokedCount,
        ipAddress: request?.ip,
        userAgent: request?.headers?.['user-agent'],
      },
    );

    this.logger.log(
      `User ${userId} deleted by admin ${adminId}. Reason: ${reason}. Sessions revoked: ${revokedCount}`,
    );
  }

  async getActiveSessionCount(userId: string): Promise<number> {
    try {
      const sessionKeys = await this.redisService.scanKeys(
        `session:${userId}:*`,
      );
      return sessionKeys.length;
    } catch (error) {
      this.logger.error(
        `Failed to get session count for user ${userId}`,
        error,
      );
      return 0;
    }
  }

  async revokeAllSessions(userId: string): Promise<number> {
    try {
      const sessionKeys = await this.redisService.scanKeys(
        `session:${userId}:*`,
      );
      if (sessionKeys.length > 0) {
        await this.redisService.del(...sessionKeys);
      }
      return sessionKeys.length;
    } catch (error) {
      this.logger.error(
        `Failed to revoke sessions for user ${userId}`,
        error,
      );
      return 0;
    }
  }

  private deriveStatus(user: User): 'active' | 'suspended' | 'deleted' {
    if (user.deletedAt) return 'deleted';
    if (user.suspendedAt) return 'suspended';
    return 'active';
  }

  private getSortColumn(sortBy: string): string {
    const sortMap: Record<string, string> = {
      email: 'user.email',
      createdAt: 'user.createdAt',
      lastLoginAt: 'user.lastLoginAt',
    };
    return sortMap[sortBy] || 'user.createdAt';
  }
}
