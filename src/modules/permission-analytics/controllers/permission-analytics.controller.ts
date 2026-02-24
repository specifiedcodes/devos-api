import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { ApiTokenGuard, ApiTokenAuth, RequiresScope } from '../guards/api-token.guard';
import { ApiTokenService } from '../services/api-token.service';
import { PermissionCheckService } from '../services/permission-check.service';
import { PermissionWebhookService } from '../services/permission-webhook.service';
import { CustomRoleService } from '../../custom-roles/services/custom-role.service';
import {
  CreateApiTokenDto,
  ApiTokenScope,
} from '../dto/create-api-token.dto';
import {
  CreatePermissionWebhookDto,
} from '../dto/create-permission-webhook.dto';
import { UpdatePermissionWebhookDto } from '../dto/update-permission-webhook.dto';
import {
  PermissionCheckRequestDto,
  PermissionCheckResponseDto,
} from '../dto/permission-check.dto';

// ==================== PERMISSION CHECK ENDPOINTS (API Token Auth) ====================

@ApiTags('Permission Check')
@Controller('api/v1/permissions')
export class PermissionCheckController {
  constructor(
    private readonly permissionCheckService: PermissionCheckService,
    private readonly customRoleService: CustomRoleService,
  ) {}

  @Post('check')
  @ApiTokenAuth()
  @RequiresScope(ApiTokenScope.PERMISSIONS_CHECK)
  @ApiOperation({ summary: 'Batch permission check (API token auth)' })
  @ApiResponse({ status: 200, description: 'Permission check results' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async checkPermissions(
    @Body() dto: PermissionCheckRequestDto,
  ): Promise<PermissionCheckResponseDto> {
    return this.permissionCheckService.checkPermissions(dto);
  }

  @Get('roles')
  @ApiTokenAuth()
  @RequiresScope(ApiTokenScope.ROLES_READ)
  @ApiOperation({ summary: 'List all roles in workspace (API token auth)' })
  @ApiResponse({ status: 200, description: 'Role list retrieved' })
  async listRoles(@Req() req: any) {
    const workspaceId = req.apiTokenWorkspaceId;
    return this.customRoleService.listRoles(workspaceId);
  }

  @Get('user/:userId')
  @ApiTokenAuth()
  @RequiresScope(ApiTokenScope.PERMISSIONS_READ)
  @ApiOperation({ summary: 'Get user effective permissions (API token auth)' })
  @ApiResponse({ status: 200, description: 'Effective permissions retrieved' })
  @ApiResponse({ status: 404, description: 'User not in workspace' })
  async getUserPermissions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: any,
  ) {
    const workspaceId = req.apiTokenWorkspaceId;
    return this.permissionCheckService.getUserEffectivePermissions(
      workspaceId,
      userId,
    );
  }

  @Get('resource/:resource')
  @ApiTokenAuth()
  @RequiresScope(ApiTokenScope.PERMISSIONS_READ)
  @ApiOperation({ summary: 'List who has access to a resource (API token auth)' })
  @ApiResponse({ status: 200, description: 'Resource access list retrieved' })
  @ApiResponse({ status: 400, description: 'Invalid resource type' })
  async getResourceAccess(
    @Param('resource') resource: string,
    @Req() req: any,
  ) {
    const workspaceId = req.apiTokenWorkspaceId;
    return this.permissionCheckService.getResourceAccessList(
      workspaceId,
      resource,
    );
  }
}

// ==================== API TOKEN MANAGEMENT ENDPOINTS (JWT Auth) ====================

@ApiTags('API Tokens')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/api-tokens')
@UseGuards(JwtAuthGuard, RoleGuard)
export class ApiTokenController {
  constructor(private readonly apiTokenService: ApiTokenService) {}

  @Post()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Create API token' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Token created' })
  @ApiResponse({ status: 400, description: 'Validation error or limit reached' })
  async createToken(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateApiTokenDto,
    @Req() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    const result = await this.apiTokenService.createToken(workspaceId, dto, actorId);
    return {
      token: {
        id: result.token.id,
        name: result.token.name,
        tokenPrefix: result.token.tokenPrefix,
        scopes: result.token.scopes,
        isActive: result.token.isActive,
        lastUsedAt: result.token.lastUsedAt,
        expiresAt: result.token.expiresAt,
        createdBy: result.token.createdBy,
        createdAt: result.token.createdAt,
      },
      rawToken: result.rawToken,
    };
  }

  @Get()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'List API tokens' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Token list retrieved' })
  async listTokens(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    const tokens = await this.apiTokenService.listTokens(workspaceId);
    return tokens.map((t) => ({
      id: t.id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      scopes: t.scopes,
      isActive: t.isActive,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
    }));
  }

  @Delete(':tokenId')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke API token' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'tokenId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Token revoked' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  async revokeToken(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Req() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    await this.apiTokenService.revokeToken(workspaceId, tokenId, actorId);
  }
}

// ==================== WEBHOOK MANAGEMENT ENDPOINTS (JWT Auth) ====================

@ApiTags('Permission Webhooks')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/permission-webhooks')
@UseGuards(JwtAuthGuard, RoleGuard)
export class PermissionWebhookController {
  constructor(
    private readonly webhookService: PermissionWebhookService,
  ) {}

  @Post()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Create permission webhook' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Webhook created' })
  @ApiResponse({ status: 400, description: 'Validation error or limit reached' })
  async createWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreatePermissionWebhookDto,
    @Req() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    const result = await this.webhookService.createWebhook(
      workspaceId,
      dto,
      actorId,
    );
    return {
      webhook: {
        id: result.webhook.id,
        url: result.webhook.url,
        eventTypes: result.webhook.eventTypes,
        isActive: result.webhook.isActive,
        failureCount: result.webhook.failureCount,
        lastTriggeredAt: result.webhook.lastTriggeredAt,
        createdAt: result.webhook.createdAt,
      },
      signingSecret: result.signingSecret,
    };
  }

  @Get()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'List permission webhooks' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Webhook list retrieved' })
  async listWebhooks(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ) {
    const webhooks = await this.webhookService.listWebhooks(workspaceId);
    return webhooks.map((w) => ({
      id: w.id,
      url: w.url,
      eventTypes: w.eventTypes,
      isActive: w.isActive,
      failureCount: w.failureCount,
      lastTriggeredAt: w.lastTriggeredAt,
      createdAt: w.createdAt,
    }));
  }

  @Put(':webhookId')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update permission webhook' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'webhookId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Webhook updated' })
  async updateWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Body() dto: UpdatePermissionWebhookDto,
    @Req() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    const webhook = await this.webhookService.updateWebhook(
      workspaceId,
      webhookId,
      dto,
      actorId,
    );
    return {
      id: webhook.id,
      url: webhook.url,
      eventTypes: webhook.eventTypes,
      isActive: webhook.isActive,
      failureCount: webhook.failureCount,
      lastTriggeredAt: webhook.lastTriggeredAt,
      createdAt: webhook.createdAt,
    };
  }

  @Delete(':webhookId')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete permission webhook' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'webhookId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Webhook deleted' })
  async deleteWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Req() req: any,
  ) {
    const actorId = req.user?.id || req.user?.sub;
    await this.webhookService.deleteWebhook(workspaceId, webhookId, actorId);
  }

  @Post(':webhookId/test')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Test permission webhook' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'webhookId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Webhook test result' })
  async testWebhook(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
  ) {
    return this.webhookService.testWebhook(workspaceId, webhookId);
  }
}
