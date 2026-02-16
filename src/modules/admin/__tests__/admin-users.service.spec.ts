import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AdminUsersService } from '../services/admin-users.service';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let mockUserRepository: any;
  let mockWorkspaceMemberRepository: any;
  let mockProjectRepository: any;
  let mockSecurityEventRepository: any;
  let mockRedisService: any;
  let mockAuditService: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    isPlatformAdmin: false,
    twoFactorEnabled: false,
    createdAt: new Date('2026-01-15'),
    lastLoginAt: new Date('2026-02-15'),
    deletedAt: null,
    suspendedAt: null,
    suspensionReason: null,
  };

  const mockAdminUser = {
    ...mockUser,
    id: 'admin-1',
    email: 'admin@example.com',
    isPlatformAdmin: true,
  };

  beforeEach(() => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      getRawAndEntities: jest.fn().mockResolvedValue({
        entities: [mockUser],
        raw: [{ workspaceCount: '3' }],
      }),
    };

    mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((user) => Promise.resolve(user)),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    mockWorkspaceMemberRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    const mockProjectQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(5),
    };

    mockProjectRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockProjectQb),
    };

    mockSecurityEventRepository = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };

    mockRedisService = {
      scanKeys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    service = new AdminUsersService(
      mockUserRepository,
      mockWorkspaceMemberRepository,
      mockProjectRepository,
      mockSecurityEventRepository,
      mockRedisService,
      mockAuditService,
    );
  });

  describe('listUsers', () => {
    it('should return paginated results with correct total count', async () => {
      const result = await service.listUsers({ page: 1, limit: 20 });

      expect(result.users).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('should include workspace count in results', async () => {
      const result = await service.listUsers({});
      expect(result.users[0].workspaceCount).toBe(3);
    });

    it('should respect max limit of 100', async () => {
      const result = await service.listUsers({ limit: 200 });
      expect(result.pagination.limit).toBe(100);
    });

    it('should default to page 1 and limit 20', async () => {
      const result = await service.listUsers({});
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('should derive correct user status', async () => {
      const result = await service.listUsers({});
      expect(result.users[0].status).toBe('active');
    });
  });

  describe('getUserDetail', () => {
    it('should return comprehensive user data with workspaces', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockWorkspaceMemberRepository.find.mockResolvedValue([
        {
          workspaceId: 'ws-1',
          workspace: { name: 'Test Workspace' },
          role: 'owner',
          createdAt: new Date('2026-01-15'),
        },
      ]);

      const result = await service.getUserDetail('user-1');

      expect(result.id).toBe('user-1');
      expect(result.email).toBe('test@example.com');
      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0].name).toBe('Test Workspace');
      expect(result.workspaces[0].role).toBe('owner');
    });

    it('should return project count', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockWorkspaceMemberRepository.find.mockResolvedValue([
        { workspaceId: 'ws-1', workspace: { name: 'WS' }, role: 'owner', createdAt: new Date() },
      ]);

      const result = await service.getUserDetail('user-1');
      expect(result.projectCount).toBe(5);
    });

    it('should return recent security events (last 10)', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      const events = [
        {
          event_type: 'login_success',
          created_at: new Date('2026-02-15'),
          ip_address: '192.168.1.1',
        },
      ];
      mockSecurityEventRepository.find.mockResolvedValue(events);
      mockSecurityEventRepository.count.mockResolvedValue(42);

      const result = await service.getUserDetail('user-1');
      expect(result.activitySummary.recentActions).toHaveLength(1);
      expect(result.activitySummary.recentActions[0].action).toBe('login_success');
    });

    it('should return active session count from Redis', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRedisService.scanKeys.mockResolvedValue([
        'session:user-1:abc',
        'session:user-1:def',
      ]);

      const result = await service.getUserDetail('user-1');
      expect(result.activeSessions).toBe(2);
    });

    it('should return 404 for non-existent user', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.getUserDetail('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('suspendUser', () => {
    it('should set suspendedAt and suspensionReason', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });

      await service.suspendUser('user-1', 'admin-1', 'Policy violation test reason');

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          suspendedAt: expect.any(Date),
          suspensionReason: 'Policy violation test reason',
        }),
      );
    });

    it('should revoke all active sessions', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockRedisService.scanKeys.mockResolvedValue([
        'session:user-1:abc',
        'session:user-1:def',
      ]);

      await service.suspendUser('user-1', 'admin-1', 'Policy violation test reason');

      expect(mockRedisService.del).toHaveBeenCalledWith(
        'session:user-1:abc',
        'session:user-1:def',
      );
    });

    it('should create audit log entry with admin action', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });

      await service.suspendUser('user-1', 'admin-1', 'Policy violation test reason');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.user_suspended',
        'user',
        'user-1',
        expect.objectContaining({ reason: 'Policy violation test reason' }),
      );
    });

    it('should throw if user already suspended', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        suspendedAt: new Date(),
      });

      await expect(
        service.suspendUser('user-1', 'admin-1', 'Policy violation test reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if targeting another platform admin', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        isPlatformAdmin: true,
      });

      await expect(
        service.suspendUser('user-1', 'admin-1', 'Policy violation test reason'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if self-suspend attempted', async () => {
      await expect(
        service.suspendUser('admin-1', 'admin-1', 'Self suspend test reason'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unsuspendUser', () => {
    it('should clear suspendedAt and suspensionReason', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        suspendedAt: new Date(),
        suspensionReason: 'Some reason',
      });

      await service.unsuspendUser('user-1', 'admin-1');

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          suspendedAt: null,
          suspensionReason: null,
        }),
      );
    });

    it('should create audit log entry', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        suspendedAt: new Date(),
      });

      await service.unsuspendUser('user-1', 'admin-1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.user_unsuspended',
        'user',
        'user-1',
        expect.any(Object),
      );
    });

    it('should throw if user not suspended', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        suspendedAt: null,
      });

      await expect(
        service.unsuspendUser('user-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.unsuspendUser('non-existent', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteUser', () => {
    it('should set deletedAt timestamp (soft delete)', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });

      await service.deleteUser('user-1', 'admin-1', 'Account termination test');

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: expect.any(Date),
        }),
      );
    });

    it('should revoke all active sessions', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockRedisService.scanKeys.mockResolvedValue(['session:user-1:abc']);

      await service.deleteUser('user-1', 'admin-1', 'Account termination test');

      expect(mockRedisService.del).toHaveBeenCalledWith('session:user-1:abc');
    });

    it('should create audit log entry', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });

      await service.deleteUser('user-1', 'admin-1', 'Account termination test');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'platform',
        'admin-1',
        'admin.user_deleted',
        'user',
        'user-1',
        expect.objectContaining({ reason: 'Account termination test' }),
      );
    });

    it('should throw if targeting another platform admin', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        isPlatformAdmin: true,
      });

      await expect(
        service.deleteUser('user-1', 'admin-1', 'Account termination test'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if self-delete attempted', async () => {
      await expect(
        service.deleteUser('admin-1', 'admin-1', 'Self delete test reason'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if user already deleted', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });

      await expect(
        service.deleteUser('user-1', 'admin-1', 'Account termination test'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getActiveSessionCount', () => {
    it('should count Redis session keys correctly', async () => {
      mockRedisService.scanKeys.mockResolvedValue([
        'session:user-1:abc',
        'session:user-1:def',
        'session:user-1:ghi',
      ]);

      const count = await service.getActiveSessionCount('user-1');
      expect(count).toBe(3);
      expect(mockRedisService.scanKeys).toHaveBeenCalledWith(
        'session:user-1:*',
      );
    });

    it('should return 0 when no sessions found', async () => {
      mockRedisService.scanKeys.mockResolvedValue([]);
      const count = await service.getActiveSessionCount('user-1');
      expect(count).toBe(0);
    });
  });

  describe('revokeAllSessions', () => {
    it('should delete all session keys and return count', async () => {
      mockRedisService.scanKeys.mockResolvedValue([
        'session:user-1:abc',
        'session:user-1:def',
      ]);

      const count = await service.revokeAllSessions('user-1');

      expect(count).toBe(2);
      expect(mockRedisService.del).toHaveBeenCalledWith(
        'session:user-1:abc',
        'session:user-1:def',
      );
    });

    it('should return 0 when no sessions to revoke', async () => {
      mockRedisService.scanKeys.mockResolvedValue([]);
      const count = await service.revokeAllSessions('user-1');
      expect(count).toBe(0);
      expect(mockRedisService.del).not.toHaveBeenCalled();
    });
  });
});
