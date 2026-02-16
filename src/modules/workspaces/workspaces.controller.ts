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
import { Throttle } from '@nestjs/throttler';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { RenameWorkspaceDto } from './dto/rename-workspace.dto';
import { WorkspaceResponseDto } from './dto/workspace-response.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { WorkspaceMemberDto } from './dto/workspace-member.dto';
import { ChangeMemberRoleDto } from './dto/change-member-role.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { InvitationStatus } from '../../database/entities/workspace-invitation.entity';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../common/guards/role.guard';

@Controller('api/v1/workspaces')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@ApiTags('Workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all workspaces for authenticated user' })
  @ApiResponse({ status: 200, type: [WorkspaceResponseDto], description: 'List of user workspaces' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserWorkspaces(@Request() req: any): Promise<WorkspaceResponseDto[]> {
    return this.workspacesService.getUserWorkspaces(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single workspace by ID' })
  @ApiResponse({ status: 200, type: WorkspaceResponseDto, description: 'Workspace details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Workspace not found or not a member' })
  async getWorkspaceById(
    @Param('id') workspaceId: string,
    @Request() req: any,
  ): Promise<WorkspaceResponseDto> {
    return this.workspacesService.getWorkspaceById(workspaceId, req.user.id);
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
    // Use req.user.userId (from JWT payload sub claim) which is always guaranteed
    // req.user.id comes from the entity spread and could be undefined if DB load fails
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
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  // NOTE: RoleGuard not applied here because workspace creation doesn't have a workspace context yet
  // Authentication via JwtAuthGuard is sufficient - all authenticated users can create workspaces
  async createWorkspace(
    @Request() req: any,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<WorkspaceResponseDto> {
    return this.workspacesService.createWorkspace(req.user.id, dto);
  }

  @Patch(':id')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Rename workspace (Admin/Owner only)' })
  @ApiResponse({ status: 200, type: WorkspaceResponseDto, description: 'Workspace renamed successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin or owner role' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async renameWorkspace(
    @Param('id') id: string,
    @Body() dto: RenameWorkspaceDto,
    @Request() req: any,
  ): Promise<WorkspaceResponseDto> {
    return this.workspacesService.renameWorkspace(id, dto.name, req.user.id);
  }

  @Delete(':id')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER)
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
    return this.workspacesService.acceptInvitation(
      token,
      req.user.id,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
    );
  }

  @Post('invitations/:id/resend')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
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
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Revoke invitation' })
  @ApiResponse({ status: 200, description: 'Invitation revoked successfully' })
  @ApiResponse({ status: 403, description: 'Only workspace owners or admins can revoke invitations' })
  async revokeInvitation(
    @Param('id') invitationId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    return this.workspacesService.revokeInvitation(invitationId, req.user.id);
  }

  @Get(':id/members')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.DEVELOPER, WorkspaceRole.VIEWER)
  @ApiOperation({ summary: 'List workspace members' })
  @ApiResponse({ status: 200, type: [WorkspaceMemberDto], description: 'List of workspace members' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getMembers(@Param('id') workspaceId: string): Promise<WorkspaceMemberDto[]> {
    return this.workspacesService.getMembers(workspaceId);
  }

  @Patch(':id/members/:memberId/role')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Max 10 role changes per minute
  @ApiOperation({ summary: 'Change member role' })
  @ApiResponse({ status: 200, type: WorkspaceMemberDto, description: 'Member role updated' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async changeMemberRole(
    @Param('id') workspaceId: string,
    @Param('memberId') memberId: string,
    @Body() dto: ChangeMemberRoleDto,
    @Request() req: any,
  ): Promise<WorkspaceMemberDto> {
    return this.workspacesService.changeMemberRole(
      workspaceId,
      memberId,
      dto.role,
      req.user.id,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
    );
  }

  @Delete(':id/members/:memberId')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Max 10 member removals per minute
  @ApiOperation({ summary: 'Remove member from workspace' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  @ApiResponse({ status: 400, description: 'Cannot remove workspace owner' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async removeMember(
    @Param('id') workspaceId: string,
    @Param('memberId') memberId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    return this.workspacesService.removeMember(
      workspaceId,
      memberId,
      req.user.id,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
    );
  }

  @Post(':id/transfer-ownership')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Max 3 ownership transfers per minute (critical operation)
  @ApiOperation({ summary: 'Transfer workspace ownership (Owner only)' })
  @ApiResponse({ status: 200, description: 'Ownership transferred successfully' })
  @ApiResponse({ status: 400, description: 'Invalid transfer request' })
  @ApiResponse({ status: 403, description: 'Only owner can transfer ownership' })
  @ApiResponse({ status: 404, description: 'Workspace or new owner not found' })
  async transferOwnership(
    @Param('id') workspaceId: string,
    @Body() dto: TransferOwnershipDto,
    @Request() req: any,
  ): Promise<{ message: string }> {
    return this.workspacesService.transferOwnership(
      workspaceId,
      req.user.id,
      dto.newOwnerId,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
    );
  }
}
