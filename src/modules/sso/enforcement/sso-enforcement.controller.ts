import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SsoEnforcementService } from './sso-enforcement.service';
import { DomainVerificationService } from '../domain/domain-verification.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import {
  EnableEnforcementDto,
  UpdateEnforcementDto,
  EnforcementStatusResponseDto,
  EnforcementCheckResponseDto,
  LoginEnforcementCheckDto,
  AddBypassEmailDto,
} from '../dto/enforcement.dto';
import { SSO_ENFORCEMENT_CONSTANTS } from '../constants/enforcement.constants';

@ApiTags('SSO - Enforcement')
@Controller()
export class SsoEnforcementController {
  private readonly logger = new Logger(SsoEnforcementController.name);

  constructor(
    private readonly ssoEnforcementService: SsoEnforcementService,
    private readonly domainVerificationService: DomainVerificationService,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
  ) {}

  /**
   * Verify that the actor has admin/owner role in the workspace.
   */
  private async verifyWorkspaceAdmin(workspaceId: string, userId: string): Promise<void> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId },
    });

    if (!member || (member.role !== WorkspaceRole.ADMIN && member.role !== WorkspaceRole.OWNER)) {
      throw new ForbiddenException('Only workspace admins and owners can manage SSO enforcement');
    }
  }

  /**
   * GET /api/workspaces/:workspaceId/sso/enforcement
   * Get enforcement status for a workspace.
   */
  @Get('api/workspaces/:workspaceId/sso/enforcement')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get SSO enforcement status for workspace' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Enforcement status retrieved', type: EnforcementStatusResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async getEnforcementStatus(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<EnforcementStatusResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const status = await this.ssoEnforcementService.getEnforcementStatus(workspaceId);
    const policy = await this.ssoEnforcementService.getPolicy(workspaceId);

    return {
      workspaceId: status.workspaceId,
      enforced: status.enforced,
      passwordLoginBlocked: status.passwordLoginBlocked,
      registrationBlocked: status.registrationBlocked,
      inGracePeriod: status.inGracePeriod,
      gracePeriodEnd: status.gracePeriodEnd,
      gracePeriodRemainingHours: status.gracePeriodRemainingHours,
      enforcementMessage: status.enforcementMessage,
      activeProviderCount: status.activeProviderCount,
      bypassEmails: policy?.bypassEmails ?? [],
      ownerBypassEnabled: policy?.ownerBypassEnabled ?? true,
      bypassServiceAccounts: policy?.bypassServiceAccounts ?? true,
    };
  }

  /**
   * POST /api/workspaces/:workspaceId/sso/enforcement/enable
   * Enable SSO enforcement for a workspace.
   */
  @Post('api/workspaces/:workspaceId/sso/enforcement/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable SSO enforcement for workspace' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Enforcement enabled', type: EnforcementStatusResponseDto })
  @ApiResponse({ status: 400, description: 'No active SSO provider configured' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async enableEnforcement(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: EnableEnforcementDto,
    @Req() req: Request,
  ): Promise<EnforcementStatusResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    await this.ssoEnforcementService.enableEnforcement({
      workspaceId,
      actorId: userId,
      gracePeriodHours: dto.gracePeriodHours,
      bypassEmails: dto.bypassEmails,
      ownerBypassEnabled: dto.ownerBypassEnabled,
      bypassServiceAccounts: dto.bypassServiceAccounts,
      enforcementMessage: dto.enforcementMessage,
    });

    return this.getEnforcementStatus(workspaceId, req);
  }

  /**
   * POST /api/workspaces/:workspaceId/sso/enforcement/disable
   * Disable SSO enforcement for a workspace.
   */
  @Post('api/workspaces/:workspaceId/sso/enforcement/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable SSO enforcement for workspace' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Enforcement disabled', type: EnforcementStatusResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  @ApiResponse({ status: 404, description: 'No enforcement policy found' })
  async disableEnforcement(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<EnforcementStatusResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    await this.ssoEnforcementService.disableEnforcement({
      workspaceId,
      actorId: userId,
    });

    return this.getEnforcementStatus(workspaceId, req);
  }

  /**
   * PUT /api/workspaces/:workspaceId/sso/enforcement
   * Update enforcement settings (partial update).
   */
  @Put('api/workspaces/:workspaceId/sso/enforcement')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update SSO enforcement settings' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Enforcement updated', type: EnforcementStatusResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  @ApiResponse({ status: 404, description: 'No enforcement policy found' })
  async updateEnforcement(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateEnforcementDto,
    @Req() req: Request,
  ): Promise<EnforcementStatusResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    await this.ssoEnforcementService.updateEnforcement({
      workspaceId,
      actorId: userId,
      bypassEmails: dto.bypassEmails,
      ownerBypassEnabled: dto.ownerBypassEnabled,
      bypassServiceAccounts: dto.bypassServiceAccounts,
      enforcementMessage: dto.enforcementMessage,
    });

    return this.getEnforcementStatus(workspaceId, req);
  }

  /**
   * GET /api/workspaces/:workspaceId/sso/enforcement/bypass
   * Get bypass email list.
   */
  @Get('api/workspaces/:workspaceId/sso/enforcement/bypass')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get SSO enforcement bypass email list' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Bypass email list retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  async getBypassList(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<{ emails: string[] }> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const emails = await this.ssoEnforcementService.getBypassList(workspaceId);
    return { emails };
  }

  /**
   * POST /api/workspaces/:workspaceId/sso/enforcement/bypass
   * Add bypass email.
   */
  @Post('api/workspaces/:workspaceId/sso/enforcement/bypass')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add email to SSO enforcement bypass list' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Bypass email added' })
  @ApiResponse({ status: 400, description: 'Invalid email or max limit reached' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  @ApiResponse({ status: 404, description: 'No enforcement policy found' })
  async addBypassEmail(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: AddBypassEmailDto,
    @Req() req: Request,
  ): Promise<{ emails: string[] }> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    const emails = await this.ssoEnforcementService.addBypassEmail(
      workspaceId,
      dto.email,
      userId,
    );
    return { emails };
  }

  /**
   * DELETE /api/workspaces/:workspaceId/sso/enforcement/bypass/:email
   * Remove bypass email.
   */
  @Delete('api/workspaces/:workspaceId/sso/enforcement/bypass/:email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Remove email from SSO enforcement bypass list' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'email', type: 'string' })
  @ApiResponse({ status: 200, description: 'Bypass email removed' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin role required' })
  @ApiResponse({ status: 404, description: 'No enforcement policy found' })
  async removeBypassEmail(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('email') email: string,
    @Req() req: Request,
  ): Promise<{ emails: string[] }> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.verifyWorkspaceAdmin(workspaceId, userId);

    // Decode the email from URL encoding (e.g., + signs, special chars)
    const decodedEmail = decodeURIComponent(email);

    // Validate email format before passing to service
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(decodedEmail)) {
      throw new BadRequestException('Invalid email format');
    }

    const emails = await this.ssoEnforcementService.removeBypassEmail(
      workspaceId,
      decodedEmail,
      userId,
    );
    return { emails };
  }

  /**
   * POST /api/auth/sso/enforcement/check
   * Check enforcement for an email (public/pre-login endpoint).
   * Used by frontend login page to determine whether to show password field or SSO redirect.
   */
  @Post('api/auth/sso/enforcement/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check SSO enforcement for email (pre-login)' })
  @ApiResponse({ status: 200, description: 'Enforcement check result', type: EnforcementCheckResponseDto })
  async checkEnforcement(
    @Body() dto: LoginEnforcementCheckDto,
  ): Promise<EnforcementCheckResponseDto> {
    const email = dto.email.toLowerCase();
    const domain = email.split('@')[1];

    if (!domain) {
      return { allowed: true, reason: 'not_enforced' };
    }

    // If workspaceId is provided, check directly
    if (dto.workspaceId) {
      const result = await this.ssoEnforcementService.checkLoginEnforcement(email, dto.workspaceId);
      return {
        allowed: result.allowed,
        reason: result.reason,
        enforcementMessage: result.enforcementMessage,
        redirectToSso: result.redirectToSso,
        ssoProviderHint: result.ssoProviderHint,
      };
    }

    // Otherwise, look up domain to find workspace
    const domainLookup = await this.domainVerificationService.lookupDomain(domain);
    if (!domainLookup) {
      return { allowed: true, reason: 'not_enforced' };
    }

    const result = await this.ssoEnforcementService.checkLoginEnforcement(
      email,
      domainLookup.workspaceId,
    );

    return {
      allowed: result.allowed,
      reason: result.reason,
      enforcementMessage: result.enforcementMessage,
      redirectToSso: result.redirectToSso,
      ssoProviderHint: result.ssoProviderHint,
    };
  }
}
