/**
 * Permission Audit Trail Completeness Tests
 *
 * Story 20-8: Permission Testing Suite (AC5)
 *
 * Tests verifying that all permission-related operations generate correct audit entries.
 * Covers: role lifecycle, permission changes, member role changes, IP events,
 * geo events, access denial events, and metadata correctness.
 */

import { PermissionAuditService } from '../services/permission-audit.service';
import { PermissionAuditEventType } from '../../../database/entities/permission-audit-event.entity';

// ---- Test Constants ----
const WORKSPACE_ID = 'ws-11111111-1111-1111-1111-111111111111';
const ACTOR_ID = 'usr-22222222-2222-2222-2222-222222222222';
const TARGET_USER_ID = 'usr-33333333-3333-3333-3333-333333333333';
const ROLE_ID = 'role-44444444-4444-4444-4444-444444444444';
const TEST_IP = '10.0.0.1';

// ---- Mock Repository ----

const mockAuditRepo = {
  create: jest.fn((entity: any) => entity),
  save: jest.fn().mockResolvedValue(undefined),
  find: jest.fn().mockResolvedValue([]),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
  }),
};

describe('Permission Audit Trail Completeness', () => {
  let auditService: PermissionAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    auditService = new PermissionAuditService(mockAuditRepo as any);
  });

  // ---- Role Lifecycle Events ----

  describe('Role lifecycle events', () => {
    it('should record role_created event with afterState', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId: ACTOR_ID,
        targetRoleId: ROLE_ID,
        afterState: {
          name: 'qa-lead',
          displayName: 'QA Lead',
          baseRole: 'developer',
        },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          eventType: PermissionAuditEventType.ROLE_CREATED,
          actorId: ACTOR_ID,
          targetRoleId: ROLE_ID,
          afterState: expect.objectContaining({
            name: 'qa-lead',
          }),
        }),
      );
      expect(mockAuditRepo.save).toHaveBeenCalled();
    });

    it('should record role_updated event with before/after states', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.ROLE_UPDATED,
        actorId: ACTOR_ID,
        targetRoleId: ROLE_ID,
        beforeState: { displayName: 'QA Lead' },
        afterState: { displayName: 'Senior QA Lead' },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.ROLE_UPDATED,
          beforeState: expect.objectContaining({ displayName: 'QA Lead' }),
          afterState: expect.objectContaining({ displayName: 'Senior QA Lead' }),
        }),
      );
    });

    it('should record role_deleted event with beforeState', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.ROLE_DELETED,
        actorId: ACTOR_ID,
        targetRoleId: ROLE_ID,
        beforeState: {
          name: 'qa-lead',
          displayName: 'QA Lead',
          memberCount: 3,
        },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.ROLE_DELETED,
          beforeState: expect.objectContaining({ name: 'qa-lead' }),
        }),
      );
    });
  });

  // ---- Permission Change Events ----

  describe('Permission change events', () => {
    it('should record permission_granted event', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.PERMISSION_GRANTED,
        actorId: ACTOR_ID,
        targetRoleId: ROLE_ID,
        afterState: {
          resourceType: 'deployments',
          permission: 'approve',
          granted: true,
        },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.PERMISSION_GRANTED,
          afterState: expect.objectContaining({
            resourceType: 'deployments',
            permission: 'approve',
            granted: true,
          }),
        }),
      );
    });

    it('should record permission_revoked event', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.PERMISSION_REVOKED,
        actorId: ACTOR_ID,
        targetRoleId: ROLE_ID,
        beforeState: {
          resourceType: 'secrets',
          permission: 'view_plaintext',
          granted: true,
        },
        afterState: {
          resourceType: 'secrets',
          permission: 'view_plaintext',
          granted: false,
        },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.PERMISSION_REVOKED,
        }),
      );
    });

    it('should record permission_bulk_updated event with count', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.PERMISSION_BULK_UPDATED,
        actorId: ACTOR_ID,
        targetRoleId: ROLE_ID,
        afterState: {
          permissionCount: 5,
          permissions: [
            { resourceType: 'projects', permission: 'create', granted: true },
            { resourceType: 'projects', permission: 'delete', granted: false },
          ],
        },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.PERMISSION_BULK_UPDATED,
          afterState: expect.objectContaining({ permissionCount: 5 }),
        }),
      );
    });
  });

  // ---- Member Role Change Events ----

  describe('Member role change events', () => {
    it('should record member_role_changed with old and new role', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.MEMBER_ROLE_CHANGED,
        actorId: ACTOR_ID,
        targetUserId: TARGET_USER_ID,
        beforeState: { role: 'developer', roleName: 'Developer' },
        afterState: { role: 'admin', roleName: 'Admin' },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.MEMBER_ROLE_CHANGED,
          targetUserId: TARGET_USER_ID,
          beforeState: expect.objectContaining({ role: 'developer' }),
          afterState: expect.objectContaining({ role: 'admin' }),
        }),
      );
    });

    it('should record member_removed event', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.MEMBER_REMOVED,
        actorId: ACTOR_ID,
        targetUserId: TARGET_USER_ID,
        beforeState: { role: 'developer', email: 'removed@example.com' },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.MEMBER_REMOVED,
          targetUserId: TARGET_USER_ID,
        }),
      );
    });
  });

  // ---- IP Allowlist Events ----

  describe('IP allowlist events', () => {
    it('should record ip_allowlist_entry_added event', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.IP_ALLOWLIST_ENTRY_ADDED,
        actorId: ACTOR_ID,
        afterState: {
          ipAddress: '10.0.0.0/8',
          description: 'Office VPN',
        },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.IP_ALLOWLIST_ENTRY_ADDED,
        }),
      );
    });

    it('should record ip_allowlist_entry_removed event', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.IP_ALLOWLIST_ENTRY_REMOVED,
        actorId: ACTOR_ID,
        beforeState: {
          ipAddress: '192.168.1.0/24',
          description: 'Old range',
        },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.IP_ALLOWLIST_ENTRY_REMOVED,
        }),
      );
    });

    it('should record ip_allowlist_enabled event', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.IP_ALLOWLIST_ENABLED,
        actorId: ACTOR_ID,
        afterState: { enabled: true },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.IP_ALLOWLIST_ENABLED,
        }),
      );
    });

    it('should record ip_allowlist_disabled event', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.IP_ALLOWLIST_DISABLED,
        actorId: ACTOR_ID,
        afterState: { enabled: false },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.IP_ALLOWLIST_DISABLED,
        }),
      );
    });
  });

  // ---- Geo-Restriction Events ----

  describe('Geo-restriction events', () => {
    it('should record geo_restriction_updated event', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.GEO_RESTRICTION_UPDATED,
        actorId: ACTOR_ID,
        beforeState: { mode: 'allowlist', countries: ['US', 'GB'] },
        afterState: { mode: 'allowlist', countries: ['US', 'GB', 'CA'] },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.GEO_RESTRICTION_UPDATED,
          beforeState: expect.objectContaining({ countries: ['US', 'GB'] }),
          afterState: expect.objectContaining({ countries: ['US', 'GB', 'CA'] }),
        }),
      );
    });
  });

  // ---- Access Denied Events ----

  describe('Access denied events', () => {
    it('should record access_denied_ip event with clientIp', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.ACCESS_DENIED_IP,
        actorId: ACTOR_ID,
        afterState: {
          clientIp: '192.168.1.100',
          endpoint: 'POST /api/v1/workspaces/ws/projects',
        },
        ipAddress: '192.168.1.100',
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.ACCESS_DENIED_IP,
          ipAddress: '192.168.1.100',
        }),
      );
    });

    it('should record access_denied_geo event with detected country', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.ACCESS_DENIED_GEO,
        actorId: ACTOR_ID,
        afterState: {
          clientIp: '198.51.100.10',
          detectedCountry: 'CN',
          endpoint: 'GET /api/v1/workspaces/ws/secrets',
        },
        ipAddress: '198.51.100.10',
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.ACCESS_DENIED_GEO,
          afterState: expect.objectContaining({ detectedCountry: 'CN' }),
        }),
      );
    });

    it('should record access_denied_permission event with required permission', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.ACCESS_DENIED_PERMISSION,
        actorId: ACTOR_ID,
        afterState: {
          required: 'deployments:approve',
          endpoint: 'POST /api/v1/deployments/123/approve',
          method: 'POST',
        },
        ipAddress: TEST_IP,
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: PermissionAuditEventType.ACCESS_DENIED_PERMISSION,
          afterState: expect.objectContaining({
            required: 'deployments:approve',
          }),
        }),
      );
    });
  });

  // ---- Metadata Correctness ----

  describe('Metadata correctness', () => {
    it('should always include correct actorId', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.ROLE_CREATED,
        actorId: ACTOR_ID,
        afterState: { name: 'test' },
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: ACTOR_ID }),
      );
    });

    it('should include ipAddress when provided', async () => {
      await auditService.record({
        workspaceId: WORKSPACE_ID,
        eventType: PermissionAuditEventType.ROLE_UPDATED,
        actorId: ACTOR_ID,
        afterState: { name: 'test' },
        ipAddress: '203.0.113.50',
      });

      expect(mockAuditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '203.0.113.50' }),
      );
    });

    it('should not throw on record failure (fire-and-forget)', async () => {
      mockAuditRepo.save.mockRejectedValueOnce(new Error('DB unavailable'));

      await expect(
        auditService.record({
          workspaceId: WORKSPACE_ID,
          eventType: PermissionAuditEventType.ROLE_CREATED,
          actorId: ACTOR_ID,
          afterState: { name: 'test' },
        }),
      ).resolves.not.toThrow();
    });
  });
});
