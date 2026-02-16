import { AdminUsersController } from '../controllers/admin-users.controller';
import { AdminUsersService } from '../services/admin-users.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let mockAdminUsersService: any;

  const mockPaginatedResult = {
    users: [
      {
        id: 'user-1',
        email: 'test@example.com',
        isPlatformAdmin: false,
        twoFactorEnabled: false,
        createdAt: '2026-01-15T00:00:00.000Z',
        lastLoginAt: '2026-02-15T10:00:00.000Z',
        status: 'active',
        workspaceCount: 3,
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    },
  };

  const mockUserDetail = {
    id: 'user-1',
    email: 'test@example.com',
    isPlatformAdmin: false,
    twoFactorEnabled: false,
    createdAt: '2026-01-15T00:00:00.000Z',
    lastLoginAt: '2026-02-15T10:00:00.000Z',
    status: 'active',
    suspendedAt: null,
    suspensionReason: null,
    workspaces: [{ id: 'ws-1', name: 'Test WS', role: 'owner', joinedAt: '2026-01-15T00:00:00.000Z' }],
    projectCount: 5,
    activitySummary: {
      totalLogins: 42,
      lastLoginIp: '192.168.1.1',
      totalSecurityEvents: 10,
      recentActions: [],
    },
    activeSessions: 2,
  };

  beforeEach(() => {
    mockAdminUsersService = {
      listUsers: jest.fn().mockResolvedValue(mockPaginatedResult),
      getUserDetail: jest.fn().mockResolvedValue(mockUserDetail),
      suspendUser: jest.fn().mockResolvedValue(undefined),
      unsuspendUser: jest.fn().mockResolvedValue(undefined),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };

    controller = new AdminUsersController(mockAdminUsersService);
  });

  describe('GET /api/admin/users', () => {
    it('should return paginated user list', async () => {
      const result = await controller.listUsers({});
      expect(result).toEqual(mockPaginatedResult);
      expect(mockAdminUsersService.listUsers).toHaveBeenCalledWith({});
    });

    it('should pass search param to service', async () => {
      await controller.listUsers({ search: 'test@example.com' });
      expect(mockAdminUsersService.listUsers).toHaveBeenCalledWith({
        search: 'test@example.com',
      });
    });

    it('should pass status param to service', async () => {
      await controller.listUsers({ status: 'suspended' });
      expect(mockAdminUsersService.listUsers).toHaveBeenCalledWith({
        status: 'suspended',
      });
    });

    it('should pass pagination params to service', async () => {
      await controller.listUsers({ page: 2, limit: 50 });
      expect(mockAdminUsersService.listUsers).toHaveBeenCalledWith({
        page: 2,
        limit: 50,
      });
    });

    it('should pass sort params to service', async () => {
      await controller.listUsers({ sortBy: 'email', sortOrder: 'asc' });
      expect(mockAdminUsersService.listUsers).toHaveBeenCalledWith({
        sortBy: 'email',
        sortOrder: 'asc',
      });
    });
  });

  describe('GET /api/admin/users/:userId', () => {
    const mockRequest = {
      user: { userId: 'admin-1' },
    };

    it('should return user detail', async () => {
      const result = await controller.getUserDetail('user-1', mockRequest);
      expect(result).toEqual(mockUserDetail);
      expect(mockAdminUsersService.getUserDetail).toHaveBeenCalledWith('user-1', 'admin-1');
    });

    it('should return 404 for unknown user', async () => {
      mockAdminUsersService.getUserDetail.mockRejectedValue(
        new NotFoundException('User not found'),
      );
      await expect(controller.getUserDetail('non-existent', mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('POST /api/admin/users/:userId/suspend', () => {
    const mockRequest = {
      user: { userId: 'admin-1' },
      ip: '192.168.1.1',
      headers: { 'user-agent': 'test' },
    };

    it('should suspend user and return success', async () => {
      const result = await controller.suspendUser(
        'user-1',
        { reason: 'Policy violation test reason' },
        mockRequest,
      );

      expect(result.status).toBe('suspended');
      expect(mockAdminUsersService.suspendUser).toHaveBeenCalledWith(
        'user-1',
        'admin-1',
        'Policy violation test reason',
        mockRequest,
      );
    });

    it('should return 400 if already suspended', async () => {
      mockAdminUsersService.suspendUser.mockRejectedValue(
        new BadRequestException('User is already suspended'),
      );

      await expect(
        controller.suspendUser(
          'user-1',
          { reason: 'Policy violation test reason' },
          mockRequest,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 403 for another admin', async () => {
      mockAdminUsersService.suspendUser.mockRejectedValue(
        new ForbiddenException('Cannot suspend another platform administrator'),
      );

      await expect(
        controller.suspendUser(
          'admin-2',
          { reason: 'Policy violation test reason' },
          mockRequest,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /api/admin/users/:userId/unsuspend', () => {
    const mockRequest = {
      user: { userId: 'admin-1' },
    };

    it('should unsuspend user and return success', async () => {
      const result = await controller.unsuspendUser('user-1', mockRequest);

      expect(result.status).toBe('active');
      expect(mockAdminUsersService.unsuspendUser).toHaveBeenCalledWith(
        'user-1',
        'admin-1',
        mockRequest,
      );
    });

    it('should return 400 if not suspended', async () => {
      mockAdminUsersService.unsuspendUser.mockRejectedValue(
        new BadRequestException('User is not suspended'),
      );

      await expect(
        controller.unsuspendUser('user-1', mockRequest),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('DELETE /api/admin/users/:userId', () => {
    const mockRequest = {
      user: { userId: 'admin-1' },
    };

    it('should soft-delete user and return success', async () => {
      const result = await controller.deleteUser(
        'user-1',
        { reason: 'Account termination test reason' },
        mockRequest,
      );

      expect(result.status).toBe('deleted');
      expect(mockAdminUsersService.deleteUser).toHaveBeenCalledWith(
        'user-1',
        'admin-1',
        'Account termination test reason',
        mockRequest,
      );
    });

    it('should return 403 for another admin', async () => {
      mockAdminUsersService.deleteUser.mockRejectedValue(
        new ForbiddenException('Cannot delete another platform administrator'),
      );

      await expect(
        controller.deleteUser(
          'admin-2',
          { reason: 'Account termination test reason' },
          mockRequest,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
