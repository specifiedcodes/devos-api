/**
 * Permission Analytics Controller Tests
 * Story 20-10: Permission Analytics
 * Target: 20 tests
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PermissionCheckController,
  ApiTokenController,
  PermissionWebhookController,
} from '../controllers/permission-analytics.controller';
import { ApiTokenService } from '../services/api-token.service';
import { PermissionCheckService } from '../services/permission-check.service';
import { PermissionWebhookService } from '../services/permission-webhook.service';
import { CustomRoleService } from '../../custom-roles/services/custom-role.service';
import { ApiTokenScope } from '../dto/create-api-token.dto';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';
import { ApiTokenGuard } from '../guards/api-token.guard';

describe('PermissionCheckController', () => {
  let controller: PermissionCheckController;
  let permissionCheckService: jest.Mocked<PermissionCheckService>;
  let customRoleService: jest.Mocked<CustomRoleService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionCheckController],
      providers: [
        {
          provide: PermissionCheckService,
          useValue: {
            checkPermissions: jest.fn().mockResolvedValue({
              results: [{ resource: 'projects', permission: 'create', granted: true }],
              userRole: 'developer',
              checkedAt: new Date().toISOString(),
              cacheHit: true,
            }),
            getUserEffectivePermissions: jest.fn().mockResolvedValue({
              userId: mockUserId,
              workspaceId: mockWorkspaceId,
              roleName: 'developer',
              permissions: { projects: { create: true } },
            }),
            getResourceAccessList: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: CustomRoleService,
          useValue: {
            listRoles: jest.fn().mockResolvedValue({ systemRoles: [], customRoles: [] }),
          },
        },
        {
          provide: Reflector,
          useValue: { get: jest.fn() },
        },
      ],
    })
      .overrideGuard(ApiTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PermissionCheckController>(PermissionCheckController);
    permissionCheckService = module.get(PermissionCheckService);
    customRoleService = module.get(CustomRoleService);
  });

  it('POST /permissions/check returns permission check results', async () => {
    const result = await controller.checkPermissions({
      userId: mockUserId,
      workspaceId: mockWorkspaceId,
      checks: [{ resource: 'projects', permission: 'create' }],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].granted).toBe(true);
  });

  it('GET /permissions/roles returns role list', async () => {
    const req = { apiTokenWorkspaceId: mockWorkspaceId };
    const result = await controller.listRoles(req);

    expect(customRoleService.listRoles).toHaveBeenCalledWith(mockWorkspaceId);
  });

  it('GET /permissions/user/:userId returns effective permissions', async () => {
    const req = { apiTokenWorkspaceId: mockWorkspaceId };
    const result = await controller.getUserPermissions(mockUserId, req);

    expect(result.userId).toBe(mockUserId);
  });

  it('GET /permissions/user/:invalidId returns 404', async () => {
    permissionCheckService.getUserEffectivePermissions.mockRejectedValue(
      new NotFoundException('User not found in workspace'),
    );
    const req = { apiTokenWorkspaceId: mockWorkspaceId };

    await expect(
      controller.getUserPermissions('invalid-id', req),
    ).rejects.toThrow(NotFoundException);
  });

  it('GET /permissions/resource/:resource returns access list', async () => {
    const req = { apiTokenWorkspaceId: mockWorkspaceId };
    const result = await controller.getResourceAccess('projects', req);

    expect(Array.isArray(result)).toBe(true);
  });

  it('GET /permissions/resource/invalid returns 400', async () => {
    permissionCheckService.getResourceAccessList.mockRejectedValue(
      new BadRequestException('Invalid resource type'),
    );
    const req = { apiTokenWorkspaceId: mockWorkspaceId };

    await expect(
      controller.getResourceAccess('invalid', req),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ApiTokenController', () => {
  let controller: ApiTokenController;
  let apiTokenService: jest.Mocked<ApiTokenService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockTokenId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiTokenController],
      providers: [
        {
          provide: ApiTokenService,
          useValue: {
            createToken: jest.fn().mockResolvedValue({
              token: {
                id: mockTokenId,
                name: 'Test Token',
                tokenPrefix: 'dvos_abc',
                scopes: ['permissions:check'],
                isActive: true,
                lastUsedAt: null,
                expiresAt: null,
                createdBy: mockActorId,
                createdAt: new Date(),
              },
              rawToken: 'dvos_test1234567890abcdefghijklmno12345',
            }),
            listTokens: jest.fn().mockResolvedValue([]),
            revokeToken: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ApiTokenController>(ApiTokenController);
    apiTokenService = module.get(ApiTokenService);
  });

  it('POST /workspaces/:id/api-tokens creates token', async () => {
    const req = { user: { id: mockActorId } };
    const result = await controller.createToken(
      mockWorkspaceId,
      { name: 'Test', scopes: ['permissions:check'] },
      req,
    );

    expect(result.rawToken).toBeDefined();
    expect(result.token.name).toBe('Test Token');
  });

  it('POST /workspaces/:id/api-tokens validates DTO', async () => {
    apiTokenService.createToken.mockRejectedValue(
      new BadRequestException('Invalid scope'),
    );
    const req = { user: { id: mockActorId } };

    await expect(
      controller.createToken(
        mockWorkspaceId,
        { name: 'Test', scopes: ['invalid'] },
        req,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('GET /workspaces/:id/api-tokens returns token list', async () => {
    const result = await controller.listTokens(mockWorkspaceId);

    expect(Array.isArray(result)).toBe(true);
  });

  it('DELETE /workspaces/:id/api-tokens/:tokenId revokes token', async () => {
    const req = { user: { id: mockActorId } };
    await expect(
      controller.revokeToken(mockWorkspaceId, mockTokenId, req),
    ).resolves.toBeUndefined();
  });

  it('DELETE /workspaces/:id/api-tokens/:tokenId returns 404 for missing token', async () => {
    apiTokenService.revokeToken.mockRejectedValue(
      new NotFoundException('API token not found'),
    );
    const req = { user: { id: mockActorId } };

    await expect(
      controller.revokeToken(mockWorkspaceId, 'missing-id', req),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('PermissionWebhookController', () => {
  let controller: PermissionWebhookController;
  let webhookService: jest.Mocked<PermissionWebhookService>;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockActorId = '22222222-2222-2222-2222-222222222222';
  const mockWebhookId = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionWebhookController],
      providers: [
        {
          provide: PermissionWebhookService,
          useValue: {
            createWebhook: jest.fn().mockResolvedValue({
              webhook: {
                id: mockWebhookId,
                url: 'https://example.com/webhook',
                eventTypes: ['permission.changed'],
                isActive: true,
                failureCount: 0,
                lastTriggeredAt: null,
                createdAt: new Date(),
              },
              signingSecret: 'secret123',
            }),
            listWebhooks: jest.fn().mockResolvedValue([]),
            updateWebhook: jest.fn().mockResolvedValue({
              id: mockWebhookId,
              url: 'https://example.com/webhook',
              eventTypes: ['permission.changed'],
              isActive: true,
              failureCount: 0,
              lastTriggeredAt: null,
              createdAt: new Date(),
            }),
            deleteWebhook: jest.fn().mockResolvedValue(undefined),
            testWebhook: jest.fn().mockResolvedValue({
              success: true,
              statusCode: 200,
              responseTime: 100,
            }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PermissionWebhookController>(PermissionWebhookController);
    webhookService = module.get(PermissionWebhookService);
  });

  it('POST /workspaces/:id/permission-webhooks creates webhook', async () => {
    const req = { user: { id: mockActorId } };
    const result = await controller.createWebhook(
      mockWorkspaceId,
      { url: 'https://example.com/webhook', eventTypes: ['permission.changed'] },
      req,
    );

    expect(result.webhook).toBeDefined();
    expect(result.signingSecret).toBe('secret123');
  });

  it('POST /workspaces/:id/permission-webhooks rejects HTTP URL', async () => {
    webhookService.createWebhook.mockRejectedValue(
      new BadRequestException('Webhook URL must use HTTPS'),
    );
    const req = { user: { id: mockActorId } };

    await expect(
      controller.createWebhook(
        mockWorkspaceId,
        { url: 'http://example.com/webhook', eventTypes: ['permission.changed'] },
        req,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('GET /workspaces/:id/permission-webhooks returns webhook list', async () => {
    const result = await controller.listWebhooks(mockWorkspaceId);

    expect(Array.isArray(result)).toBe(true);
  });

  it('PUT /workspaces/:id/permission-webhooks/:id updates webhook', async () => {
    const req = { user: { id: mockActorId } };
    const result = await controller.updateWebhook(
      mockWorkspaceId,
      mockWebhookId,
      { isActive: false },
      req,
    );

    expect(result).toBeDefined();
  });

  it('DELETE /workspaces/:id/permission-webhooks/:id deletes webhook', async () => {
    const req = { user: { id: mockActorId } };
    await expect(
      controller.deleteWebhook(mockWorkspaceId, mockWebhookId, req),
    ).resolves.toBeUndefined();
  });

  it('POST /workspaces/:id/permission-webhooks/:id/test tests webhook', async () => {
    const result = await controller.testWebhook(mockWorkspaceId, mockWebhookId);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseTime).toBe(100);
  });

  it('POST /workspaces/:id/permission-webhooks/:id/test handles failure', async () => {
    webhookService.testWebhook.mockResolvedValue({
      success: false,
      statusCode: 500,
      responseTime: 2000,
    });

    const result = await controller.testWebhook(mockWorkspaceId, mockWebhookId);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
  });
});
