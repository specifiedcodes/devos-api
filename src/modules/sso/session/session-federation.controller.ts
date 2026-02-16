import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SessionFederationService } from './session-federation.service';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { SessionTerminationReason } from '../../../database/entities/sso-federated-session.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import {
  UpdateSessionTimeoutDto,
  ForceReauthDto,
  FederatedSessionResponseDto,
  SessionListQueryDto,
  WorkspaceSessionSummaryResponseDto,
  ForceReauthResponseDto,
  ValidateSessionDto,
} from '../dto/session-federation.dto';

@ApiTags('SSO - Sessions')
@Controller('api/auth/sso/sessions')
export class SessionFederationController {
  constructor(
    private readonly sessionFederationService: SessionFederationService,
    private readonly ssoAuditService: SsoAuditService,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
  ) {}

  /**
   * List federated sessions for the current user across all workspaces.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List current user federated sessions' })
  @ApiResponse({ status: 200, type: [FederatedSessionResponseDto] })
  async listMySessions(
    @Req() req: Request,
  ): Promise<FederatedSessionResponseDto[]> {
    const userId = this.extractUserId(req);
    const sessions = await this.sessionFederationService.getActiveSessions(userId);

    return sessions.map((s) => this.toResponseDto(s));
  }

  /**
   * List workspace federated sessions (admin only).
   */
  @Get('workspace/:workspaceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List workspace federated sessions (admin)' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated session list' })
  @ApiResponse({ status: 403, description: 'Not workspace admin' })
  async listWorkspaceSessions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: SessionListQueryDto,
    @Req() req: Request,
  ): Promise<{ sessions: FederatedSessionResponseDto[]; total: number; page: number; limit: number }> {
    const userId = this.extractUserId(req);
    await this.requireWorkspaceAdmin(userId, workspaceId);

    const page = query.page || 1;
    const limit = query.limit || 50;

    const result = await this.sessionFederationService.listWorkspaceSessions(
      workspaceId,
      {
        userId: query.userId,
        status: query.status,
        page,
        limit,
      },
    );

    return {
      sessions: result.sessions.map((s) => this.toResponseDto(s)),
      total: result.total,
      page,
      limit,
    };
  }

  /**
   * Get workspace session summary (admin only).
   */
  @Get('workspace/:workspaceId/summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get workspace session summary (admin)' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: WorkspaceSessionSummaryResponseDto })
  @ApiResponse({ status: 403, description: 'Not workspace admin' })
  async getWorkspaceSummary(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<WorkspaceSessionSummaryResponseDto> {
    const userId = this.extractUserId(req);
    await this.requireWorkspaceAdmin(userId, workspaceId);

    return this.sessionFederationService.getWorkspaceSessionSummary(workspaceId);
  }

  /**
   * Update workspace session timeout settings (admin only).
   * Changes apply to new sessions only.
   */
  @Put('workspace/:workspaceId/timeout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update workspace session timeout (admin)' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Timeout configuration updated' })
  @ApiResponse({ status: 400, description: 'Invalid timeout values' })
  @ApiResponse({ status: 403, description: 'Not workspace admin' })
  async updateTimeout(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateSessionTimeoutDto,
    @Req() req: Request,
  ): Promise<{ sessionTimeoutMinutes: number; idleTimeoutMinutes: number }> {
    const userId = this.extractUserId(req);
    await this.requireWorkspaceAdmin(userId, workspaceId);

    // Persist timeout config in Redis for workspace via service
    const config = await this.sessionFederationService.setWorkspaceTimeoutConfig(
      workspaceId,
      {
        sessionTimeoutMinutes: dto.sessionTimeoutMinutes,
        idleTimeoutMinutes: dto.idleTimeoutMinutes,
      },
    );

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SESSION_TIMEOUT_UPDATED,
      actorId: userId,
      details: config,
    });

    return config;
  }

  /**
   * Force re-authentication for workspace users (admin only).
   */
  @Post('workspace/:workspaceId/force-reauth')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Force re-authentication (admin)' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: ForceReauthResponseDto })
  @ApiResponse({ status: 403, description: 'Not workspace admin' })
  async forceReauth(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: ForceReauthDto,
    @Req() req: Request,
  ): Promise<ForceReauthResponseDto> {
    const userId = this.extractUserId(req);
    await this.requireWorkspaceAdmin(userId, workspaceId);

    let result: ForceReauthResponseDto;

    if (dto.targetUserId) {
      // Terminate specific user's sessions
      const count = await this.sessionFederationService.terminateUserSessions(
        dto.targetUserId,
        workspaceId,
        SessionTerminationReason.FORCED,
      );
      result = {
        terminatedCount: count,
        affectedUserIds: count > 0 ? [dto.targetUserId] : [],
      };
    } else {
      // Terminate all workspace sessions except the admin
      result = await this.sessionFederationService.terminateAllWorkspaceSessions(
        workspaceId,
        SessionTerminationReason.FORCED,
        userId,
      );
    }

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.FORCED_REAUTH,
      actorId: userId,
      details: {
        reason: dto.reason,
        targetUserId: dto.targetUserId || 'all',
        terminatedCount: result.terminatedCount,
        affectedUserIds: result.affectedUserIds,
      },
    });

    return result;
  }

  /**
   * Terminate a specific federated session.
   * Users can terminate their own sessions; admins can terminate any session in their workspace.
   */
  @Delete(':sessionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Terminate a federated session' })
  @ApiParam({ name: 'sessionId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Session terminated' })
  @ApiResponse({ status: 403, description: 'Not authorized to terminate this session' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() req: Request,
  ): Promise<void> {
    const userId = this.extractUserId(req);

    const session = await this.sessionFederationService.getSessionById(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Check authorization: own session OR workspace admin
    if (session.userId !== userId) {
      await this.requireWorkspaceAdmin(userId, session.workspaceId);
    }

    await this.sessionFederationService.terminateSession(
      sessionId,
      SessionTerminationReason.LOGOUT,
    );
  }

  /**
   * Validate a federated session (internal use).
   */
  @Post('validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Validate a federated session' })
  @ApiResponse({ status: 200, description: 'Session validation result' })
  async validateSession(
    @Body() dto: ValidateSessionDto,
  ): Promise<{ isValid: boolean; reason?: string }> {
    const result = await this.sessionFederationService.validateSession(dto.sessionId);
    return {
      isValid: result.isValid,
      reason: result.reason,
    };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private extractUserId(req: Request): string {
    return (req as any).user?.id || (req as any).user?.sub;
  }

  private async requireWorkspaceAdmin(userId: string, workspaceId: string): Promise<void> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { userId, workspaceId },
    });

    if (!member || (member.role !== WorkspaceRole.ADMIN && member.role !== WorkspaceRole.OWNER)) {
      throw new ForbiddenException('Only workspace admins and owners can perform this action');
    }
  }

  private toResponseDto(session: any): FederatedSessionResponseDto {
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    const isActive = !session.terminatedAt && expiresAt > now;
    const remainingMinutes = isActive
      ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 60000))
      : 0;

    return {
      id: session.id,
      userId: session.userId,
      workspaceId: session.workspaceId,
      providerType: session.providerType,
      providerConfigId: session.providerConfigId,
      idpSessionId: session.idpSessionId,
      devosSessionId: session.devosSessionId,
      sessionTimeoutMinutes: session.sessionTimeoutMinutes,
      idleTimeoutMinutes: session.idleTimeoutMinutes,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastActivityAt: session.lastActivityAt,
      terminatedAt: session.terminatedAt,
      terminationReason: session.terminationReason,
      isActive,
      remainingMinutes,
    };
  }
}
