import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ScimTokenService } from './scim-token.service';
import { ScimSyncLogService } from './scim-sync-log.service';
import {
  UpdateScimConfigDto,
  CreateScimTokenDto,
  ScimConfigResponseDto,
  ScimTokenResponseDto,
  ScimTokenCreatedResponseDto,
  ScimSyncLogListResponseDto,
  ScimSyncLogResponseDto,
} from '../dto/scim.dto';
import { ScimConfiguration } from '../../../database/entities/scim-configuration.entity';
import { ScimToken } from '../../../database/entities/scim-token.entity';

@ApiTags('SSO - SCIM Administration')
@Controller('api/auth/sso/scim')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ScimAdminController {
  constructor(
    private readonly scimTokenService: ScimTokenService,
    private readonly scimSyncLogService: ScimSyncLogService,
  ) {}

  /**
   * GET /api/auth/sso/scim/config?workspaceId=...
   */
  @Get('config')
  @ApiOperation({ summary: 'Get SCIM configuration for a workspace' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async getConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<ScimConfigResponseDto> {
    const config = await this.scimTokenService.getConfig(workspaceId);
    return this.toConfigResponseDto(config);
  }

  /**
   * PUT /api/auth/sso/scim/config?workspaceId=...
   */
  @Put('config')
  @ApiOperation({ summary: 'Update SCIM configuration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async updateConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateScimConfigDto,
    @Req() req: Request,
  ): Promise<ScimConfigResponseDto> {
    const actorId = (req as any).user?.id ?? (req as any).user?.sub ?? '';
    const config = await this.scimTokenService.updateConfig(workspaceId, dto, actorId);
    return this.toConfigResponseDto(config);
  }

  /**
   * GET /api/auth/sso/scim/tokens?workspaceId=...
   */
  @Get('tokens')
  @ApiOperation({ summary: 'List SCIM tokens for a workspace' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async listTokens(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<ScimTokenResponseDto[]> {
    const tokens = await this.scimTokenService.listTokens(workspaceId);
    return tokens.map((t) => this.toTokenResponseDto(t));
  }

  /**
   * POST /api/auth/sso/scim/tokens?workspaceId=...
   */
  @Post('tokens')
  @ApiOperation({ summary: 'Generate a new SCIM token' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async generateToken(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateScimTokenDto,
    @Req() req: Request,
  ): Promise<ScimTokenCreatedResponseDto> {
    const actorId = (req as any).user?.id ?? (req as any).user?.sub ?? '';
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const { token, tokenRecord } = await this.scimTokenService.generateToken(
      workspaceId,
      dto.label || 'Default SCIM Token',
      expiresAt,
      actorId,
    );

    const response = this.toTokenResponseDto(tokenRecord) as ScimTokenCreatedResponseDto;
    response.token = token;
    return response;
  }

  /**
   * DELETE /api/auth/sso/scim/tokens/:tokenId?workspaceId=...
   */
  @Delete('tokens/:tokenId')
  @ApiOperation({ summary: 'Revoke a SCIM token' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async revokeToken(
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<ScimTokenResponseDto> {
    const actorId = (req as any).user?.id ?? (req as any).user?.sub ?? '';
    const token = await this.scimTokenService.revokeToken(workspaceId, tokenId, actorId);
    return this.toTokenResponseDto(token);
  }

  /**
   * POST /api/auth/sso/scim/tokens/:tokenId/rotate?workspaceId=...
   */
  @Post('tokens/:tokenId/rotate')
  @ApiOperation({ summary: 'Rotate a SCIM token' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async rotateToken(
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: Request,
  ): Promise<ScimTokenCreatedResponseDto> {
    const actorId = (req as any).user?.id ?? (req as any).user?.sub ?? '';
    const { token, tokenRecord } = await this.scimTokenService.rotateToken(
      workspaceId,
      tokenId,
      actorId,
    );

    const response = this.toTokenResponseDto(tokenRecord) as ScimTokenCreatedResponseDto;
    response.token = token;
    return response;
  }

  /**
   * GET /api/auth/sso/scim/sync-logs?workspaceId=...
   */
  @Get('sync-logs')
  @ApiOperation({ summary: 'List SCIM sync logs for a workspace' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  async listSyncLogs(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('resourceType') resourceType?: string,
    @Query('operation') operation?: string,
    @Query('status') status?: string,
  ): Promise<ScimSyncLogListResponseDto> {
    const result = await this.scimSyncLogService.listLogs(workspaceId, {
      resourceType,
      operation,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    return {
      logs: result.logs.map((log) => {
        const dto = new ScimSyncLogResponseDto();
        dto.id = log.id;
        dto.operation = log.operation;
        dto.resourceType = log.resourceType;
        dto.resourceId = log.resourceId;
        dto.externalId = log.externalId;
        dto.status = log.status;
        dto.errorMessage = log.errorMessage;
        dto.createdAt = log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt);
        return dto;
      }),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  private toConfigResponseDto(config: ScimConfiguration): ScimConfigResponseDto {
    const dto = new ScimConfigResponseDto();
    dto.id = config.id;
    dto.workspaceId = config.workspaceId;
    dto.enabled = config.enabled;
    dto.baseUrl = config.baseUrl;
    dto.defaultRole = config.defaultRole;
    dto.syncGroups = config.syncGroups;
    dto.autoDeactivate = config.autoDeactivate;
    dto.autoReactivate = config.autoReactivate;
    dto.createdAt = config.createdAt instanceof Date ? config.createdAt.toISOString() : String(config.createdAt);
    dto.updatedAt = config.updatedAt instanceof Date ? config.updatedAt.toISOString() : String(config.updatedAt);
    return dto;
  }

  private toTokenResponseDto(token: ScimToken): ScimTokenResponseDto {
    const dto = new ScimTokenResponseDto();
    dto.id = token.id;
    dto.workspaceId = token.workspaceId;
    dto.tokenPrefix = token.tokenPrefix;
    dto.label = token.label;
    dto.isActive = token.isActive;
    dto.lastUsedAt = token.lastUsedAt instanceof Date ? token.lastUsedAt.toISOString() : token.lastUsedAt;
    dto.expiresAt = token.expiresAt instanceof Date ? token.expiresAt.toISOString() : token.expiresAt;
    dto.createdAt = token.createdAt instanceof Date ? token.createdAt.toISOString() : String(token.createdAt);
    return dto;
  }
}
