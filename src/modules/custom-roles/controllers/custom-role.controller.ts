import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { CustomRoleService } from '../services/custom-role.service';
import { RoleTemplateService } from '../services/role-template.service';
import { CreateCustomRoleDto } from '../dto/create-custom-role.dto';
import { UpdateCustomRoleDto } from '../dto/update-custom-role.dto';
import { CloneCustomRoleDto } from '../dto/clone-custom-role.dto';
import { ReorderRolesDto } from '../dto/reorder-roles.dto';
import { CreateRoleFromTemplateDto } from '../dto/create-from-template.dto';

@ApiTags('Custom Roles')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/roles')
@UseGuards(JwtAuthGuard, RoleGuard)
export class CustomRoleController {
  constructor(
    private readonly customRoleService: CustomRoleService,
    private readonly roleTemplateService: RoleTemplateService,
  ) {}

  // === Static routes MUST be defined BEFORE dynamic routes ===

  @Get('icons')
  @ApiOperation({ summary: 'Get available icon names for role creation' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Icon list retrieved' })
  async getAvailableIcons(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
  ): Promise<{ icons: string[] }> {
    return { icons: this.customRoleService.getAvailableIcons() };
  }

  @Get('templates')
  @ApiOperation({ summary: 'List all available role templates' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Template list retrieved' })
  async listTemplates(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
  ): Promise<{ templates: any[] }> {
    return { templates: this.roleTemplateService.listTemplates() };
  }

  @Get('templates/:templateId')
  @ApiOperation({ summary: 'Get a single role template with full permission details' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'templateId', type: 'string' })
  @ApiResponse({ status: 200, description: 'Template details retrieved' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplate(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
    @Param('templateId') templateId: string,
  ): Promise<any> {
    return this.roleTemplateService.getTemplate(templateId);
  }

  @Post('from-template')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a custom role from a template' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Role created from template' })
  @ApiResponse({ status: 400, description: 'Invalid input or max roles reached' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async createRoleFromTemplate(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateRoleFromTemplateDto,
    @Req() req: any,
  ): Promise<any> {
    return this.roleTemplateService.createRoleFromTemplate(
      workspaceId,
      dto,
      req.user.id,
    );
  }

  @Put('reorder')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reorder custom roles by priority' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Roles reordered' })
  @ApiResponse({ status: 400, description: 'Invalid role IDs' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async reorderRoles(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: ReorderRolesDto,
    @Req() req: any,
  ): Promise<void> {
    await this.customRoleService.reorderRoles(
      workspaceId,
      dto.roleIds,
      req.user.id,
    );
  }

  // === Read Endpoints (any workspace member) ===

  @Get()
  @ApiOperation({ summary: 'List all roles (system + custom) for a workspace' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Role list retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a workspace member' })
  async listRoles(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<any> {
    return this.customRoleService.listRoles(workspaceId);
  }

  @Get(':roleId')
  @ApiOperation({ summary: 'Get a single custom role by ID' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Role details retrieved' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async getRole(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<any> {
    return this.customRoleService.getRole(roleId, workspaceId);
  }

  @Get(':roleId/members')
  @ApiOperation({ summary: 'List members assigned to a specific role' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Role members retrieved' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async getRoleMembers(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<any> {
    return this.customRoleService.getRoleMembers(roleId, workspaceId);
  }

  // === Write Endpoints (admin/owner only) ===

  @Post()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new custom role' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Role created' })
  @ApiResponse({ status: 400, description: 'Invalid input or max roles reached' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 409, description: 'Role name already exists' })
  async createRole(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateCustomRoleDto,
    @Req() req: any,
  ): Promise<any> {
    return this.customRoleService.createRole(workspaceId, dto, req.user.id);
  }

  @Put(':roleId')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update a custom role' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions or system role',
  })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 409, description: 'Role name already exists' })
  async updateRole(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: UpdateCustomRoleDto,
    @Req() req: any,
  ): Promise<any> {
    return this.customRoleService.updateRole(
      roleId,
      workspaceId,
      dto,
      req.user.id,
    );
  }

  @Delete(':roleId')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a custom role (must have no assigned members)',
  })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Role deleted' })
  @ApiResponse({ status: 400, description: 'Role has assigned members' })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions or system role',
  })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async deleteRole(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Req() req: any,
  ): Promise<void> {
    await this.customRoleService.deleteRole(roleId, workspaceId, req.user.id);
  }

  @Post(':roleId/clone')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Clone an existing role as a new custom role' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Role cloned' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or max roles reached',
  })
  @ApiResponse({ status: 404, description: 'Source role not found' })
  @ApiResponse({ status: 409, description: 'Clone name already exists' })
  async cloneRole(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: CloneCustomRoleDto,
    @Req() req: any,
  ): Promise<any> {
    return this.customRoleService.cloneRole(
      roleId,
      workspaceId,
      dto,
      req.user.id,
    );
  }

  @Post(':roleId/reset-to-template')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset a role\'s permissions to its template defaults' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roleId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Permissions reset to template defaults' })
  @ApiResponse({ status: 400, description: 'Role was not created from a template' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async resetToTemplate(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Req() req: any,
  ): Promise<void> {
    await this.roleTemplateService.resetRoleToTemplate(
      roleId,
      workspaceId,
      req.user.id,
    );
  }
}
