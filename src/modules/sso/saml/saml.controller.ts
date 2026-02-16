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
import { SamlService } from './saml.service';
import { SamlConfigService } from './saml-config.service';
import { SsoAuditService } from '../sso-audit.service';
import { CreateSamlConfigDto } from '../dto/create-saml-config.dto';
import { UpdateSamlConfigDto } from '../dto/update-saml-config.dto';
import { SamlConfigResponseDto } from '../dto/saml-config-response.dto';
import { SamlMetadataResponseDto } from '../dto/saml-metadata-response.dto';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';

@ApiTags('SSO - SAML')
@Controller('api/auth/saml')
export class SamlController {
  private readonly logger = new Logger(SamlController.name);

  constructor(
    private readonly samlService: SamlService,
    private readonly samlConfigService: SamlConfigService,
    private readonly ssoAuditService: SsoAuditService,
  ) {}

  // ==================== SAML Config CRUD ====================

  @Post(':workspaceId/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create SAML configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, type: SamlConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid certificate or input' })
  @ApiResponse({ status: 403, description: 'Not workspace admin' })
  async createConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateSamlConfigDto,
    @Req() req: Request,
  ): Promise<SamlConfigResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.samlConfigService.createConfig(workspaceId, dto, userId);
  }

  @Get(':workspaceId/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List SAML configurations' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: [SamlConfigResponseDto] })
  async listConfigs(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<SamlConfigResponseDto[]> {
    return this.samlConfigService.listConfigs(workspaceId);
  }

  @Get(':workspaceId/config/:configId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get SAML configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SamlConfigResponseDto })
  @ApiResponse({ status: 404, description: 'Config not found' })
  async getConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
  ): Promise<SamlConfigResponseDto> {
    return this.samlConfigService.getConfig(workspaceId, configId);
  }

  @Put(':workspaceId/config/:configId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update SAML configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SamlConfigResponseDto })
  async updateConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Body() dto: UpdateSamlConfigDto,
    @Req() req: Request,
  ): Promise<SamlConfigResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.samlConfigService.updateConfig(workspaceId, configId, dto, userId);
  }

  @Delete(':workspaceId/config/:configId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete SAML configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Configuration deleted' })
  async deleteConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Req() req: Request,
  ): Promise<void> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    await this.samlConfigService.deleteConfig(workspaceId, configId, userId);
  }

  // ==================== Activate / Deactivate ====================

  @Post(':workspaceId/config/:configId/activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Activate SAML configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SamlConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Configuration not tested' })
  async activateConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Req() req: Request,
  ): Promise<SamlConfigResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.samlConfigService.activateConfig(workspaceId, configId, userId);
  }

  @Post(':workspaceId/config/:configId/deactivate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Deactivate SAML configuration' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: SamlConfigResponseDto })
  async deactivateConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Req() req: Request,
  ): Promise<SamlConfigResponseDto> {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.samlConfigService.deactivateConfig(workspaceId, configId, userId);
  }

  // ==================== SP Metadata ====================

  @Get(':workspaceId/metadata')
  @ApiOperation({ summary: 'Get SP metadata (no auth required for IdP admins)' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'format', required: false, enum: ['xml', 'json'], description: 'Response format' })
  @ApiQuery({ name: 'configId', required: false, type: 'string', description: 'SAML config ID' })
  @ApiResponse({ status: 200, type: SamlMetadataResponseDto })
  async getMetadata(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('format') format?: string,
    @Query('configId') configId?: string,
    @Res() res?: Response,
  ): Promise<void> {
    // If no configId, try to find any config for workspace
    let resolvedConfigId = configId;
    if (!resolvedConfigId) {
      const configs = await this.samlConfigService.listConfigs(workspaceId);
      if (configs.length > 0) {
        resolvedConfigId = configs[0].id;
      } else {
        res!.status(HttpStatus.NOT_FOUND).json({ message: 'No SAML configuration found' });
        return;
      }
    }

    const metadata = await this.samlService.generateSpMetadata(workspaceId, resolvedConfigId);

    if (format === 'xml') {
      res!.set('Content-Type', 'application/xml');
      res!.send(metadata.metadataXml);
    } else {
      res!.json(metadata);
    }
  }

  // ==================== SAML Login Flow ====================

  @Get(':workspaceId/login')
  @ApiOperation({ summary: 'Initiate SAML login (SP-Initiated SSO)' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'configId', required: false, type: 'string', description: 'SAML config ID for multi-IdP' })
  @ApiResponse({ status: 302, description: 'Redirect to IdP SSO URL' })
  @ApiResponse({ status: 400, description: 'No active SAML config or config not active' })
  async initiateLogin(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('configId') configId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    let resolvedConfigId = configId;

    if (!resolvedConfigId) {
      const activeConfigs = await this.samlConfigService.findActiveConfigsForWorkspace(workspaceId);
      if (activeConfigs.length === 0) {
        res.status(HttpStatus.BAD_REQUEST).json({ message: 'No active SAML configuration found' });
        return;
      }
      if (activeConfigs.length > 1 && !configId) {
        res.status(HttpStatus.BAD_REQUEST).json({
          message: 'Multiple active SAML configurations. Please specify configId.',
          configs: activeConfigs.map((c) => ({
            id: c.id,
            providerName: c.providerName,
            displayName: c.displayName,
          })),
        });
        return;
      }
      resolvedConfigId = activeConfigs[0].id;
    }

    const result = await this.samlService.initiateLogin(workspaceId, resolvedConfigId);
    res.redirect(result.redirectUrl);
  }

  // ==================== ACS Callback ====================

  @Post(':workspaceId/callback')
  @ApiOperation({ summary: 'ACS endpoint - receives SAML Response from IdP' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens or error' })
  async handleCallback(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: { SAMLResponse?: string; RelayState?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!body.SAMLResponse) {
      const errorUrl = this.samlService.getErrorRedirectUrl('missing_saml_response');
      res.redirect(errorUrl);
      return;
    }

    try {
      const result = await this.samlService.handleCallback(
        workspaceId,
        body.SAMLResponse,
        body.RelayState,
        ipAddress,
        userAgent,
      );

      const successUrl = this.samlService.getSuccessRedirectUrl(
        result.accessToken,
        result.refreshToken,
      );
      res.redirect(successUrl);
    } catch (error) {
      this.logger.error('SAML callback failed', error);
      // Use generic error codes to avoid leaking internal details via redirect URL
      let errorCode = 'saml_error';
      if (error instanceof BadRequestException) {
        errorCode = 'invalid_request';
      } else if (error instanceof UnauthorizedException) {
        errorCode = 'authentication_failed';
      }
      const errorUrl = this.samlService.getErrorRedirectUrl(errorCode);
      res.redirect(errorUrl);
    }
  }

  // ==================== SLO ====================

  @Post(':workspaceId/logout')
  @ApiOperation({ summary: 'SLO endpoint - handles logout request/response' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 302, description: 'Redirect to IdP or frontend' })
  async handleLogout(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: { SAMLRequest?: string; SAMLResponse?: string },
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.samlService.handleLogout(
      workspaceId,
      body.SAMLResponse,
      body.SAMLRequest,
    );

    if (result.redirectUrl) {
      res.redirect(result.redirectUrl);
    } else {
      res.status(HttpStatus.OK).json({ message: 'Logout processed' });
    }
  }

  // ==================== Test Connection ====================

  @Post(':workspaceId/config/:configId/test')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Test SAML connection' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'configId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Redirect URL for test authentication' })
  async testConnection(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.id || (req as any).user?.sub;
    return this.samlService.testConnection(workspaceId, configId, userId);
  }

  // ==================== Audit Events ====================

  @Get(':workspaceId/audit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List SSO audit events' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'eventType', required: false })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiResponse({ status: 200, description: 'Paginated audit events' })
  async listAuditEvents(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('eventType') eventType?: SsoAuditEventType,
    @Query('actorId') actorId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedDateFrom = dateFrom ? new Date(dateFrom) : undefined;
    const parsedDateTo = dateTo ? new Date(dateTo) : undefined;
    return this.ssoAuditService.listEvents(workspaceId, {
      eventType,
      actorId,
      dateFrom: parsedDateFrom && !isNaN(parsedDateFrom.getTime()) ? parsedDateFrom : undefined,
      dateTo: parsedDateTo && !isNaN(parsedDateTo.getTime()) ? parsedDateTo : undefined,
      page: Number.isNaN(parsedPage) ? undefined : parsedPage,
      limit: Number.isNaN(parsedLimit) ? undefined : parsedLimit,
    });
  }
}
