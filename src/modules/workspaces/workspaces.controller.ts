import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { RenameWorkspaceDto } from './dto/rename-workspace.dto';
import { WorkspaceResponseDto } from './dto/workspace-response.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { InvitationStatus } from '../../database/entities/workspace-invitation.entity';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from './guards/workspace-owner.guard';
import { WorkspaceAdminGuard } from './guards/workspace-admin.guard';
import { RoleGuard, RequireRole } from '../../common/guards/role.guard';

@Controller('api/v1/workspaces')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all workspaces for authenticated user' })
  @ApiResponse({ status: 200, type: [WorkspaceResponseDto], description: 'List of user workspaces' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserWorkspaces(@Request() req: any): Promise<WorkspaceResponseDto[]> {
    return this.workspacesService.getUserWorkspaces(req.user.id);
  }

  @Post(':id/switch')
  @HttpCode(200)
  @ApiOperation({ summary: 'Switch to a different workspace' })
  @ApiResponse({
    status: 200,
    description: 'Workspace switched successfully',
    schema: {
      properties: {
        workspace: { type: 'object' },
        tokens: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a member of this workspace' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async switchWorkspace(
    @Param('id') workspaceId: string,
    @Request() req: any,
  ): Promise<{
    workspace: WorkspaceResponseDto;
    tokens: { access_token: string; refresh_token: string };
  }> {
    return this.workspacesService.switchWorkspace(
      req.user.userId,
      workspaceId,
      req.user.jti,
      req.ip,
      req.headers['user-agent'] || 'unknown',
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  @ApiResponse({ status: 201, type: WorkspaceResponseDto, description: 'Workspace created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createWorkspace(
    @Request() req: any,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    return this.workspacesService.createWorkspace(req.user.id, dto);
  }

  @Patch(':id')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Rename workspace (Admin/Owner only)' })
  @ApiResponse({ status: 200, type: WorkspaceResponseDto, description: 'Workspace renamed successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin or owner role' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async renameWorkspace(
    @Param('id') id: string,
    @Body() dto: RenameWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    return this.workspacesService.renameWorkspace(id, dto.name);
  }

  @Delete(':id')
  @UseGuards(WorkspaceOwnerGuard)
  @ApiOperation({ summary: 'Delete workspace (Owner only)' })
  @ApiResponse({ status: 200, description: 'Workspace soft deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires owner role' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async deleteWorkspace(@Param('id') id: string): Promise<{ message: string }> {
    await this.workspacesService.softDeleteWorkspace(id);
    return {
      message: 'Workspace deleted successfully. Data will be permanently removed in 30 days.',
    };
  }

  @Post(':id/invitations')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Invite user to workspace' })
  @ApiResponse({ status: 201, type: InvitationResponseDto, description: 'Invitation created successfully' })
  @ApiResponse({ status: 400, description: 'User already member or invitation pending' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createInvitation(
    @Param('id') workspaceId: string,
    @Body() createInvitationDto: CreateInvitationDto,
    @Request() req: any,
  ): Promise<InvitationResponseDto> {
    return this.workspacesService.createInvitation(
      workspaceId,
      req.user.id,
      createInvitationDto,
    );
  }

  @Get(':id/invitations')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'List workspace invitations' })
  @ApiResponse({ status: 200, type: [InvitationResponseDto], description: 'List of invitations' })
  async getInvitations(
    @Param('id') workspaceId: string,
    @Query('status') status?: InvitationStatus,
  ): Promise<InvitationResponseDto[]> {
    return this.workspacesService.getInvitations(workspaceId, status);
  }

  @Get('invitations/:token/details')
  @ApiOperation({ summary: 'Get invitation details (public)' })
  @ApiResponse({ status: 200, type: InvitationResponseDto, description: 'Invitation details' })
  @ApiResponse({ status: 404, description: 'Invitation not found or expired' })
  async getInvitationDetails(
    @Param('token') token: string,
  ): Promise<InvitationResponseDto> {
    return this.workspacesService.getInvitationDetails(token);
  }

  @Post('invitations/:token/accept')
  @ApiOperation({ summary: 'Accept workspace invitation' })
  @ApiResponse({ status: 200, description: 'Invitation accepted, user added to workspace' })
  @ApiResponse({ status: 400, description: 'Invalid or expired invitation' })
  async acceptInvitation(
    @Param('token') token: string,
    @Request() req: any,
  ): Promise<{ workspace: WorkspaceResponseDto; tokens: any }> {
    return this.workspacesService.acceptInvitation(token, req.user.id);
  }

  @Post('invitations/:id/resend')
  @ApiOperation({ summary: 'Resend invitation email' })
  @ApiResponse({ status: 200, description: 'Invitation resent successfully' })
  @ApiResponse({ status: 403, description: 'Only workspace owners or admins can resend invitations' })
  async resendInvitation(
    @Param('id') invitationId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    return this.workspacesService.resendInvitation(invitationId, req.user.id);
  }

  @Delete('invitations/:id')
  @ApiOperation({ summary: 'Revoke invitation' })
  @ApiResponse({ status: 200, description: 'Invitation revoked successfully' })
  @ApiResponse({ status: 403, description: 'Only workspace owners or admins can revoke invitations' })
  async revokeInvitation(
    @Param('id') invitationId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    return this.workspacesService.revokeInvitation(invitationId, req.user.id);
  }
}
