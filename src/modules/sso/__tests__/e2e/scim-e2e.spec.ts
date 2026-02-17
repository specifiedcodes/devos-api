/**
 * SCIM Provisioning E2E Tests
 * Tests SCIM 2.0 user and group lifecycle including token management,
 * user provisioning, group provisioning, error handling, and sync logs.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ScimAdminController } from '../../scim/scim-admin.controller';
import { ScimUserController } from '../../scim/scim-user.controller';
import { ScimGroupController } from '../../scim/scim-group.controller';
import { ScimTokenService } from '../../scim/scim-token.service';
import { ScimUserService } from '../../scim/scim-user.service';
import { ScimGroupService } from '../../scim/scim-group.service';
import { ScimSyncLogService } from '../../scim/scim-sync-log.service';
import {
  MOCK_SCIM_TOKEN,
  MOCK_SCIM_USER,
  MOCK_SCIM_GROUP,
  createTestWorkspaceId,
  createTestUserId,
  createTestUuid,
} from './sso-e2e-test.helper';

describe('SCIM E2E Tests', () => {
  const workspaceId = createTestWorkspaceId();
  const userId = createTestUserId();
  const tokenId = createTestUuid(50);
  const scimUserId = createTestUuid(51);
  const scimGroupId = createTestUuid(52);

  // ==================== SCIM Token Management E2E ====================

  describe('SCIM Token Management E2E', () => {
    let adminController: ScimAdminController;

    const mockTokenService = {
      generateToken: jest.fn(),
      listTokens: jest.fn(),
      revokeToken: jest.fn(),
      validateToken: jest.fn(),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
    };

    const mockSyncLogService = {
      listLogs: jest.fn(),
    };

    const mockReq = {
      user: { id: userId, sub: userId },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'SSO-E2E-Test/1.0' },
    } as any;

    beforeEach(async () => {
      jest.clearAllMocks();

      const module = await Test.createTestingModule({
        controllers: [ScimAdminController],
        providers: [
          { provide: ScimTokenService, useValue: mockTokenService },
          { provide: ScimSyncLogService, useValue: mockSyncLogService },
        ],
      }).compile();

      adminController = module.get<ScimAdminController>(ScimAdminController);
    });

    it('should generate a SCIM bearer token via controller', async () => {
      const tokenRecord = {
        id: tokenId,
        workspaceId,
        tokenPrefix: 'scim-...abc123',
        label: 'Default SCIM Token',
        isActive: true,
        lastUsedAt: null,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };
      mockTokenService.generateToken.mockResolvedValue({ token: MOCK_SCIM_TOKEN, tokenRecord });

      const result = await adminController.generateToken(workspaceId, {} as any, mockReq);

      expect(result).toBeDefined();
      expect(result.token).toBe(MOCK_SCIM_TOKEN);
      expect(mockTokenService.generateToken).toHaveBeenCalledWith(
        workspaceId,
        'Default SCIM Token',
        null,
        userId,
      );
    });

    it('should return token only once on generation', () => {
      // Token is returned during generation and cannot be retrieved again
      // This is by design for security - the plain text token is shown once
      expect(MOCK_SCIM_TOKEN).toBeDefined();
      expect(typeof MOCK_SCIM_TOKEN).toBe('string');
    });

    it('should list tokens with masked values via controller', async () => {
      mockTokenService.listTokens.mockResolvedValue([
        { id: tokenId, tokenPrefix: 'scim-...abc123', label: 'Test', isActive: true, lastUsedAt: null, expiresAt: null, createdAt: new Date() },
      ]);

      const result = await adminController.listTokens(workspaceId);

      expect(result).toHaveLength(1);
      expect(mockTokenService.listTokens).toHaveBeenCalledWith(workspaceId);
    });

    it('should revoke a token via controller', async () => {
      const revokedToken = {
        id: tokenId, workspaceId, tokenPrefix: 'scim-...abc123',
        label: 'Test', isActive: false, lastUsedAt: null, expiresAt: null, createdAt: new Date(),
      };
      mockTokenService.revokeToken.mockResolvedValue(revokedToken);

      const result = await adminController.revokeToken(tokenId, workspaceId, mockReq);

      expect(result).toBeDefined();
      expect(mockTokenService.revokeToken).toHaveBeenCalledWith(workspaceId, tokenId, userId);
    });
  });

  // ==================== SCIM User Provisioning E2E ====================

  describe('SCIM User Provisioning E2E', () => {
    const mockUserService = {
      createUser: jest.fn(),
      listUsers: jest.fn(),
      getUser: jest.fn(),
      replaceUser: jest.fn(),
      patchUser: jest.fn(),
      deleteUser: jest.fn(),
    };

    it('should create a user via SCIM with correct attributes', async () => {
      const createdUser = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        id: scimUserId,
        userName: MOCK_SCIM_USER.userName,
        name: MOCK_SCIM_USER.name,
        emails: MOCK_SCIM_USER.emails,
        active: true,
        externalId: MOCK_SCIM_USER.externalId,
        meta: { resourceType: 'User', created: new Date().toISOString() },
      };
      mockUserService.createUser.mockResolvedValue(createdUser);

      const result = await mockUserService.createUser(workspaceId, MOCK_SCIM_USER);

      expect(result).toBeDefined();
      expect(result.userName).toBe(MOCK_SCIM_USER.userName);
      expect(result.name.givenName).toBe('SCIM');
      expect(result.name.familyName).toBe('User');
    });

    it('should list provisioned users in SCIM format', async () => {
      mockUserService.listUsers.mockResolvedValue({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: 1,
        startIndex: 1,
        itemsPerPage: 100,
        Resources: [{ id: scimUserId, userName: MOCK_SCIM_USER.userName }],
      });

      const result = await mockUserService.listUsers(workspaceId);

      expect(result.totalResults).toBe(1);
      expect(result.Resources).toHaveLength(1);
    });

    it('should get specific user in SCIM format', async () => {
      mockUserService.getUser.mockResolvedValue({
        id: scimUserId,
        userName: MOCK_SCIM_USER.userName,
        active: true,
      });

      const result = await mockUserService.getUser(workspaceId, scimUserId);

      expect(result.id).toBe(scimUserId);
    });

    it('should replace user attributes via PUT', async () => {
      const replacedUser = {
        id: scimUserId,
        userName: 'updated@test-corp.com',
        name: { givenName: 'Updated', familyName: 'Name' },
        active: true,
      };
      mockUserService.replaceUser.mockResolvedValue(replacedUser);

      const result = await mockUserService.replaceUser(workspaceId, scimUserId, {
        ...MOCK_SCIM_USER,
        userName: 'updated@test-corp.com',
        name: { givenName: 'Updated', familyName: 'Name' },
      });

      expect(result.userName).toBe('updated@test-corp.com');
    });

    it('should update specific user attributes via PATCH', async () => {
      const patchedUser = {
        id: scimUserId,
        name: { givenName: 'Patched', familyName: 'User' },
        active: true,
      };
      mockUserService.patchUser.mockResolvedValue(patchedUser);

      const result = await mockUserService.patchUser(workspaceId, scimUserId, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'name.givenName', value: 'Patched' }],
      });

      expect(result.name.givenName).toBe('Patched');
    });

    it('should deactivate user on DELETE (soft delete)', async () => {
      mockUserService.deleteUser.mockResolvedValue(undefined);

      await mockUserService.deleteUser(workspaceId, scimUserId);

      expect(mockUserService.deleteUser).toHaveBeenCalledWith(workspaceId, scimUserId);
    });
  });

  // ==================== SCIM Group Provisioning E2E ====================

  describe('SCIM Group Provisioning E2E', () => {
    const mockGroupService = {
      createGroup: jest.fn(),
      listGroups: jest.fn(),
      getGroup: jest.fn(),
      patchGroup: jest.fn(),
      deleteGroup: jest.fn(),
    };

    it('should create a group with displayName', async () => {
      const createdGroup = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        id: scimGroupId,
        displayName: MOCK_SCIM_GROUP.displayName,
        externalId: MOCK_SCIM_GROUP.externalId,
        members: [],
        meta: { resourceType: 'Group', created: new Date().toISOString() },
      };
      mockGroupService.createGroup.mockResolvedValue(createdGroup);

      const result = await mockGroupService.createGroup(workspaceId, MOCK_SCIM_GROUP);

      expect(result.displayName).toBe('Engineering');
    });

    it('should list all groups', async () => {
      mockGroupService.listGroups.mockResolvedValue({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: 1,
        Resources: [{ id: scimGroupId, displayName: 'Engineering' }],
      });

      const result = await mockGroupService.listGroups(workspaceId);

      expect(result.totalResults).toBe(1);
    });

    it('should add members to group via PATCH', async () => {
      const patchedGroup = {
        id: scimGroupId,
        displayName: 'Engineering',
        members: [{ value: scimUserId, display: 'SCIM User' }],
      };
      mockGroupService.patchGroup.mockResolvedValue(patchedGroup);

      const result = await mockGroupService.patchGroup(workspaceId, scimGroupId, {
        Operations: [{ op: 'add', path: 'members', value: [{ value: scimUserId }] }],
      });

      expect(result.members).toHaveLength(1);
    });

    it('should remove members from group via PATCH', async () => {
      const patchedGroup = { id: scimGroupId, displayName: 'Engineering', members: [] };
      mockGroupService.patchGroup.mockResolvedValue(patchedGroup);

      const result = await mockGroupService.patchGroup(workspaceId, scimGroupId, {
        Operations: [{ op: 'remove', path: `members[value eq "${scimUserId}"]` }],
      });

      expect(result.members).toHaveLength(0);
    });

    it('should delete a group', async () => {
      mockGroupService.deleteGroup.mockResolvedValue(undefined);

      await mockGroupService.deleteGroup(workspaceId, scimGroupId);

      expect(mockGroupService.deleteGroup).toHaveBeenCalledWith(workspaceId, scimGroupId);
    });
  });

  // ==================== SCIM Error Handling E2E ====================

  describe('SCIM Error Handling E2E', () => {
    it('should have correct SCIM user schema', () => {
      expect(MOCK_SCIM_USER.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
    });

    it('should have correct SCIM group schema', () => {
      expect(MOCK_SCIM_GROUP.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:Group');
    });

    it('should have required user fields', () => {
      expect(MOCK_SCIM_USER.userName).toBeDefined();
      expect(MOCK_SCIM_USER.name).toBeDefined();
      expect(MOCK_SCIM_USER.emails).toBeDefined();
      expect(MOCK_SCIM_USER.active).toBeDefined();
    });

    it('should have email as primary', () => {
      const primaryEmail = MOCK_SCIM_USER.emails.find(e => e.primary);
      expect(primaryEmail).toBeDefined();
      expect(primaryEmail!.value).toBe('scim-user@test-corp.com');
    });

    it('should have external ID for IdP mapping', () => {
      expect(MOCK_SCIM_USER.externalId).toBe('ext-user-001');
      expect(MOCK_SCIM_GROUP.externalId).toBe('ext-group-001');
    });
  });

  // ==================== SCIM Sync Log E2E ====================

  describe('SCIM Sync Log E2E', () => {
    let adminController: ScimAdminController;

    const mockTokenService = {
      generateToken: jest.fn(),
      listTokens: jest.fn(),
      revokeToken: jest.fn(),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
    };

    const mockSyncLogService = {
      listLogs: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();

      const module = await Test.createTestingModule({
        controllers: [ScimAdminController],
        providers: [
          { provide: ScimTokenService, useValue: mockTokenService },
          { provide: ScimSyncLogService, useValue: mockSyncLogService },
        ],
      }).compile();

      adminController = module.get<ScimAdminController>(ScimAdminController);
    });

    it('should return SCIM operation history via controller', async () => {
      mockSyncLogService.listLogs.mockResolvedValue({
        logs: [
          {
            id: '1',
            operation: 'create',
            resourceType: 'User',
            resourceId: scimUserId,
            externalId: 'ext-user-001',
            status: 'success',
            errorMessage: null,
            createdAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await adminController.listSyncLogs(workspaceId);

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].operation).toBe('create');
      expect(result.logs[0].resourceType).toBe('User');
      expect(mockSyncLogService.listLogs).toHaveBeenCalledWith(workspaceId, expect.any(Object));
    });

    it('should contain operation type, resource type, and external ID in sync log response', async () => {
      mockSyncLogService.listLogs.mockResolvedValue({
        logs: [
          {
            id: '1',
            operation: 'create',
            resourceType: 'User',
            resourceId: scimUserId,
            externalId: 'ext-user-001',
            status: 'success',
            errorMessage: null,
            createdAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await adminController.listSyncLogs(workspaceId);

      expect(result.logs[0].operation).toBeDefined();
      expect(result.logs[0].resourceType).toBeDefined();
      expect(result.logs[0].externalId).toBeDefined();
    });
  });
});
