import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OidcService } from './oidc.service';
import { OidcConfigService } from './oidc-config.service';
import { CreateOidcConfigDto } from '../dto/create-oidc-config.dto';
import { UpdateOidcConfigDto } from '../dto/update-oidc-config.dto';
import { OidcConfigResponseDto } from '../dto/oidc-config-response.dto';
import { OIDC_CONSTANTS } from '../constants/oidc.constants';

@ApiTags('SSO - OIDC')
@Controller('api/auth/oidc')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(
    private readonly oidcService: OidcService,
    private readonly oidcConfigService: OidcConfigService,
  ) {}

  // ==================== OIDC Config CRUD ====================

  @Post(':workspaceId/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create OIDC configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, type: OidcConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid discovery URL or input' })
  @ApiResponse({ status: 403, description: 'Not workspace admin' })
  async createConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateOidcConfigDto,
    @Req() req: Request,
  ): Promise<OidcConfigResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.oidcConfigService.createConfig(workspaceId, dto, userId);
  }

  @Get(':workspaceId/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List OIDC configurations' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: [OidcConfigResponseDto] })
  async listConfigs(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<OidcConfigResponseDto[]> {
    return this.oidcConfigService.listConfigs(workspaceId);
  }

  @Get(':workspaceId/config/:configId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get OIDC configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: OidcConfigResponseDto })
  @ApiResponse({ status: 404, description: 'Config not found' })
  async getConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
  ): Promise<OidcConfigResponseDto> {
    return this.oidcConfigService.getConfig(workspaceId, configId);
  }

  @Put(':workspaceId/config/:configId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update OIDC configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: OidcConfigResponseDto })
  async updateConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Body() dto: UpdateOidcConfigDto,
    @Req() req: Request,
  ): Promise<OidcConfigResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.oidcConfigService.updateConfig(workspaceId, configId, dto, userId);
  }

  @Delete(':workspaceId/config/:configId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete OIDC configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Configuration deleted' })
  async deleteConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Req() req: Request,
  ): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.oidcConfigService.deleteConfig(workspaceId, configId, userId);
  }

  // ==================== Activate / Deactivate ====================

  @Post(':workspaceId/config/:configId/activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Activate OIDC configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: OidcConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Configuration not tested' })
  async activateConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Req() req: Request,
  ): Promise<OidcConfigResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.oidcConfigService.activateConfig(workspaceId, configId, userId);
  }

  @Post(':workspaceId/config/:configId/deactivate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Deactivate OIDC configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: OidcConfigResponseDto })
  async deactivateConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Req() req: Request,
  ): Promise<OidcConfigResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.oidcConfigService.deactivateConfig(workspaceId, configId, userId);
  }

  // ==================== Discovery Refresh ====================

  @Post(':workspaceId/config/:configId/refresh-discovery')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Force refresh OIDC discovery document' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: OidcConfigResponseDto })
  async refreshDiscovery(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Req() req: Request,
  ): Promise<OidcConfigResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.oidcConfigService.refreshDiscovery(workspaceId, configId, userId);
  }

  // ==================== OIDC Login Flow ====================

  @Get(':workspaceId/login')
  @ApiOperation({ summary: 'Initiate OIDC login (redirects to provider)' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'configId', required: false, type: 'string', description: 'OIDC config ID for multi-IdP' })
  @ApiResponse({ status: 302, description: 'Redirect to OIDC provider' })
  @ApiResponse({ status: 400, description: 'No active OIDC config or config not active' })
  async initiateLogin(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('configId') configId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    let resolvedConfigId = configId;

    if (!resolvedConfigId) {
      const activeConfigs = await this.oidcConfigService.findActiveConfigsForWorkspace(workspaceId);
      if (activeConfigs.length === 0) {
        res.status(HttpStatus.BAD_REQUEST).json({ message: 'No active OIDC configuration found' });
        return;
      }
      if (activeConfigs.length > 1) {
        res.status(HttpStatus.BAD_REQUEST).json({
          message: 'Multiple active OIDC configurations. Please specify configId.',
          configs: activeConfigs.map((c) => ({
            id: c.id,
            providerType: c.providerType,
            displayName: c.displayName,
          })),
        });
        return;
      }
      resolvedConfigId = activeConfigs[0].id;
    }

    const result = await this.oidcService.initiateLogin(workspaceId, resolvedConfigId);
    res.redirect(result.redirectUrl);
  }

  // ==================== OAuth2 Callback ====================

  @Get(':workspaceId/callback')
  @ApiOperation({ summary: 'OAuth2 callback - receives authorization code from provider' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'error', required: false })
  @ApiQuery({ name: 'error_description', required: false })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens or error' })
  async handleCallback(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Handle provider error
    if (error) {
      this.logger.warn(`OIDC provider returned error: ${error} - ${errorDescription}`);
      const errorUrl = this.oidcService.getErrorRedirectUrl(error);
      res.redirect(errorUrl);
      return;
    }

    if (!code || !state) {
      const errorUrl = this.oidcService.getErrorRedirectUrl('missing_params');
      res.redirect(errorUrl);
      return;
    }

    try {
      const result = await this.oidcService.handleCallback(
        workspaceId,
        code,
        state,
        ipAddress,
        userAgent,
      );

      const successUrl = this.oidcService.getSuccessRedirectUrl(
        result.accessToken,
        result.refreshToken,
      );
      res.redirect(successUrl);
    } catch (err) {
      this.logger.error('OIDC callback failed', err);
      let errorCode = 'oidc_error';
      if (err instanceof BadRequestException) {
        errorCode = 'invalid_request';
      } else if (err instanceof UnauthorizedException) {
        errorCode = 'authentication_failed';
      } else if (err instanceof ForbiddenException) {
        errorCode = 'domain_not_allowed';
      }
      const errorUrl = this.oidcService.getErrorRedirectUrl(errorCode);
      res.redirect(errorUrl);
    }
  }

  // ==================== Test Connection ====================

  @Post(':workspaceId/config/:configId/test')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Test OIDC connection' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Redirect URL for test authentication' })
  async testConnection(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.oidcService.testConnection(workspaceId, configId, userId);
  }

  // ==================== Provider Presets ====================

  @Get(':workspaceId/provider-presets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get OIDC provider presets' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Provider preset configurations' })
  async getProviderPresets(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
  ) {
    return OIDC_CONSTANTS.PROVIDER_PRESETS;
  }
}
