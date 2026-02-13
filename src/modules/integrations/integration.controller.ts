import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';
import { IntegrationConnectionService } from './integration-connection.service';
import { GitHubCallbackQueryDto } from './dto/github-callback-query.dto';
import { RailwayCallbackQueryDto } from './dto/railway-callback-query.dto';
import { VercelCallbackQueryDto } from './dto/vercel-callback-query.dto';
import { SupabaseCallbackQueryDto } from './dto/supabase-callback-query.dto';

/**
 * IntegrationController
 * Story 6.1: GitHub OAuth Integration Setup
 * Story 6.5: Railway Deployment Integration (added Railway OAuth endpoints)
 * Story 6.6: Vercel Deployment Integration (added Vercel OAuth endpoints)
 * Story 6.7: Supabase Database Provisioning (added Supabase OAuth endpoints)
 *
 * Handles integration management endpoints for workspaces.
 * OAuth callback is handled separately (no auth guard since providers redirect directly).
 */
@Controller('api/v1/workspaces/:workspaceId/integrations')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class IntegrationController {
  private readonly logger = new Logger(IntegrationController.name);

  constructor(
    private readonly integrationConnectionService: IntegrationConnectionService,
  ) {}

  /**
   * Generate GitHub OAuth authorization URL
   * GET /api/v1/workspaces/:workspaceId/integrations/github/oauth/authorize
   */
  @Get('github/oauth/authorize')
  async getAuthorizationUrl(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.integrationConnectionService.generateAuthorizationUrl(
      userId,
      workspaceId,
    );
  }

  /**
   * List all integrations for the workspace
   * GET /api/v1/workspaces/:workspaceId/integrations
   */
  @Get()
  async getIntegrations(@Param('workspaceId') workspaceId: string) {
    return this.integrationConnectionService.getIntegrations(workspaceId);
  }

  /**
   * Get GitHub connection status
   * GET /api/v1/workspaces/:workspaceId/integrations/github/status
   */
  @Get('github/status')
  async getGitHubStatus(@Param('workspaceId') workspaceId: string) {
    return this.integrationConnectionService.getGitHubStatus(workspaceId);
  }

  /**
   * Disconnect GitHub integration
   * DELETE /api/v1/workspaces/:workspaceId/integrations/github
   */
  @Delete('github')
  async disconnectGitHub(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.integrationConnectionService.disconnectIntegration(
      workspaceId,
      'github',
      userId,
    );
  }

  /**
   * Generate Railway OAuth authorization URL
   * GET /api/v1/workspaces/:workspaceId/integrations/railway/oauth/authorize
   * Story 6.5: Railway Deployment Integration
   */
  @Get('railway/oauth/authorize')
  async getRailwayAuthorizationUrl(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.integrationConnectionService.generateRailwayAuthorizationUrl(
      userId,
      workspaceId,
    );
  }

  /**
   * Get Railway connection status
   * GET /api/v1/workspaces/:workspaceId/integrations/railway/status
   * Story 6.5: Railway Deployment Integration
   */
  @Get('railway/status')
  async getRailwayStatus(@Param('workspaceId') workspaceId: string) {
    return this.integrationConnectionService.getRailwayStatus(workspaceId);
  }

  /**
   * Disconnect Railway integration
   * DELETE /api/v1/workspaces/:workspaceId/integrations/railway
   * Story 6.5: Railway Deployment Integration
   */
  @Delete('railway')
  async disconnectRailway(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.integrationConnectionService.disconnectIntegration(
      workspaceId,
      'railway',
      userId,
    );
  }

  /**
   * Generate Vercel OAuth authorization URL
   * GET /api/v1/workspaces/:workspaceId/integrations/vercel/oauth/authorize
   * Story 6.6: Vercel Deployment Integration
   */
  @Get('vercel/oauth/authorize')
  async getVercelAuthorizationUrl(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.integrationConnectionService.generateVercelAuthorizationUrl(
      userId,
      workspaceId,
    );
  }

  /**
   * Get Vercel connection status
   * GET /api/v1/workspaces/:workspaceId/integrations/vercel/status
   * Story 6.6: Vercel Deployment Integration
   */
  @Get('vercel/status')
  async getVercelStatus(@Param('workspaceId') workspaceId: string) {
    return this.integrationConnectionService.getVercelStatus(workspaceId);
  }

  /**
   * Disconnect Vercel integration
   * DELETE /api/v1/workspaces/:workspaceId/integrations/vercel
   * Story 6.6: Vercel Deployment Integration
   */
  @Delete('vercel')
  async disconnectVercel(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.integrationConnectionService.disconnectIntegration(
      workspaceId,
      'vercel',
      userId,
    );
  }

  /**
   * Generate Supabase OAuth authorization URL
   * GET /api/v1/workspaces/:workspaceId/integrations/supabase/oauth/authorize
   * Story 6.7: Supabase Database Provisioning
   */
  @Get('supabase/oauth/authorize')
  async getSupabaseAuthorizationUrl(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.integrationConnectionService.generateSupabaseAuthorizationUrl(
      userId,
      workspaceId,
    );
  }

  /**
   * Get Supabase connection status
   * GET /api/v1/workspaces/:workspaceId/integrations/supabase/status
   * Story 6.7: Supabase Database Provisioning
   */
  @Get('supabase/status')
  async getSupabaseStatus(@Param('workspaceId') workspaceId: string) {
    return this.integrationConnectionService.getSupabaseStatus(workspaceId);
  }

  /**
   * Disconnect Supabase integration
   * DELETE /api/v1/workspaces/:workspaceId/integrations/supabase
   * Story 6.7: Supabase Database Provisioning
   */
  @Delete('supabase')
  async disconnectSupabase(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.integrationConnectionService.disconnectIntegration(
      workspaceId,
      'supabase',
      userId,
    );
  }
}

/**
 * IntegrationCallbackController
 * Separate controller for OAuth callbacks that don't require JWT auth.
 * Story 6.1: GitHub OAuth callback
 * Story 6.5: Railway OAuth callback
 * Story 6.6: Vercel OAuth callback
 * Story 6.7: Supabase OAuth callback
 * Providers redirect to a fixed URL, so we can't include workspace guards.
 * Authentication is done via the CSRF state parameter stored in Redis.
 */
@Controller('api/v1/integrations')
export class IntegrationCallbackController {
  private readonly logger = new Logger(IntegrationCallbackController.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly integrationConnectionService: IntegrationConnectionService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  /**
   * GitHub OAuth callback
   * GET /api/v1/integrations/github/oauth/callback
   * No auth guard - authenticated via CSRF state parameter
   * ValidationPipe ensures code and state query params are present and valid strings
   */
  @Get('github/oauth/callback')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async handleGitHubCallback(
    @Query() query: GitHubCallbackQueryDto,
    @Res() res: Response,
  ) {
    try {
      const { redirectUrl } =
        await this.integrationConnectionService.handleCallback(
          query.code,
          query.state,
        );

      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error(
        `GitHub OAuth callback error: ${error instanceof Error ? error.message : String(error)}`,
      );

      const errorMessage = encodeURIComponent(
        error instanceof Error ? error.message : 'Unknown error',
      );

      return res.redirect(
        `${this.frontendUrl}/settings/integrations?github=error&message=${errorMessage}`,
      );
    }
  }

  /**
   * Railway OAuth callback
   * GET /api/v1/integrations/railway/oauth/callback
   * No auth guard - authenticated via CSRF state parameter
   * Story 6.5: Railway Deployment Integration
   */
  @Get('railway/oauth/callback')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async handleRailwayCallback(
    @Query() query: RailwayCallbackQueryDto,
    @Res() res: Response,
  ) {
    try {
      const { redirectUrl } =
        await this.integrationConnectionService.handleRailwayCallback(
          query.code,
          query.state,
        );

      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error(
        `Railway OAuth callback error: ${error instanceof Error ? error.message : String(error)}`,
      );

      const errorMessage = encodeURIComponent(
        error instanceof Error ? error.message : 'Unknown error',
      );

      return res.redirect(
        `${this.frontendUrl}/settings/integrations?railway=error&message=${errorMessage}`,
      );
    }
  }

  /**
   * Vercel OAuth callback
   * GET /api/v1/integrations/vercel/oauth/callback
   * No auth guard - authenticated via CSRF state parameter
   * Story 6.6: Vercel Deployment Integration
   */
  @Get('vercel/oauth/callback')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async handleVercelCallback(
    @Query() query: VercelCallbackQueryDto,
    @Res() res: Response,
  ) {
    try {
      const { redirectUrl } =
        await this.integrationConnectionService.handleVercelCallback(
          query.code,
          query.state,
        );

      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error(
        `Vercel OAuth callback error: ${error instanceof Error ? error.message : String(error)}`,
      );

      const errorMessage = encodeURIComponent(
        error instanceof Error ? error.message : 'Unknown error',
      );

      return res.redirect(
        `${this.frontendUrl}/settings/integrations?vercel=error&message=${errorMessage}`,
      );
    }
  }

  /**
   * Supabase OAuth callback
   * GET /api/v1/integrations/supabase/oauth/callback
   * No auth guard - authenticated via CSRF state parameter
   * Story 6.7: Supabase Database Provisioning
   */
  @Get('supabase/oauth/callback')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async handleSupabaseCallback(
    @Query() query: SupabaseCallbackQueryDto,
    @Res() res: Response,
  ) {
    try {
      const { redirectUrl } =
        await this.integrationConnectionService.handleSupabaseCallback(
          query.code,
          query.state,
        );

      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error(
        `Supabase OAuth callback error: ${error instanceof Error ? error.message : String(error)}`,
      );

      const errorMessage = encodeURIComponent(
        error instanceof Error ? error.message : 'Unknown error',
      );

      return res.redirect(
        `${this.frontendUrl}/settings/integrations?supabase=error&message=${errorMessage}`,
      );
    }
  }
}
