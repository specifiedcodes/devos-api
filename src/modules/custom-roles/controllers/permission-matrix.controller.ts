import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
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
import { ResourceType } from '../../../database/entities/role-permission.entity';
import { PermissionMatrixService } from '../services/permission-matrix.service';
import { SetPermissionDto } from '../dto/set-permission.dto';
import {
  SetBulkPermissionsDto,
  ResourceBulkActionDto,
  ResetPermissionsDto,
} from '../dto/set-bulk-permissions.dto';

@ApiTags('Permission Matrix')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/roles')
@UseGuards(JwtAuthGuard, RoleGuard)
export class PermissionMatrixController {
  constructor(
    private readonly permissionMatrixService: PermissionMatrixService,
  ) {}

  // === Static routes MUST be defined BEFORE dynamic routes ===

  @Get('resource-definitions')
  @ApiOperation({ summary: 'Get available resource types and their permissions' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Resource definitions retrieved' })
  async getResourceDefinitions(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
  ): Promise<{ resources: Record<string, string[]> }> {
    return { resources: this.permissionMatrixService.getResourceDefinitions() };
  }

  @Get('base-role-defaults')
  @ApiOperation({ summary: 'Get base role default permissions' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Base role defaults retrieved' })
  async getBaseRoleDefaults(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
  ): Promise<{ defaults: Record<string, Record<string, Record<string, boolean>>> }> {
    return { defaults: this.permissionMatrixService.getBaseRoleDefaults() };
  }

  @Get('effective-permissions/:userId')
  @ApiOperation({ summary: 'Get effective permissions for a user in this workspace' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Effective permissions retrieved' })
  @ApiResponse({ status: 404, description: 'User not found in workspace' })
  async getEffectivePermissions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<any> {
    return this.permissionMatrixService.getEffectivePermissions(
      userId,
      workspaceId,
    );
  }

  // === Dynamic routes ===

  @Get(':roleId/permissions')
  @ApiOperation({ summary: 'Get full permission matrix for a custom role' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Permission matrix retrieved' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async getPermissionMatrix(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<any> {
    return this.permissionMatrixService.getPermissionMatrix(
      roleId,
      workspaceId,
    );
  }

  @Put(':roleId/permissions')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Set a single permission for a custom role' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Permission set' })
  @ApiResponse({ status: 400, description: 'Invalid resource type or permission' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions or system role' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async setPermission(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: SetPermissionDto,
    @Req() req: any,
  ): Promise<any> {
    return this.permissionMatrixService.setPermission(
      roleId,
      workspaceId,
      dto,
      req.user.id,
    );
  }

  @Put(':roleId/permissions/bulk')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Set multiple permissions for a custom role at once' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Permissions updated' })
  @ApiResponse({ status: 400, description: 'Invalid permissions' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions or system role' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async setBulkPermissions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: SetBulkPermissionsDto,
    @Req() req: any,
  ): Promise<any> {
    return this.permissionMatrixService.setBulkPermissions(
      roleId,
      workspaceId,
      dto.permissions,
      req.user.id,
    );
  }

  @Post(':roleId/permissions/resource-action')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Allow All or Deny All permissions for a resource type' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Resource permissions updated' })
  @ApiResponse({ status: 400, description: 'Invalid resource type or action' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async bulkResourceAction(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: ResourceBulkActionDto,
    @Req() req: any,
  ): Promise<void> {
    await this.permissionMatrixService.bulkResourceAction(
      roleId,
      workspaceId,
      dto.resourceType as ResourceType,
      dto.action,
      req.user.id,
    );
  }

  @Post(':roleId/permissions/reset')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset permissions to base role defaults' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Permissions reset' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async resetPermissions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: ResetPermissionsDto,
    @Req() req: any,
  ): Promise<void> {
    await this.permissionMatrixService.resetPermissions(
      roleId,
      workspaceId,
      dto.resourceType,
      req.user.id,
    );
  }
}
