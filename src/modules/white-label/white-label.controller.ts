/**
 * White-Label Controller
 * Story 22-1: White-Label Configuration (AC4)
 *
 * REST API endpoints for white-label configuration management.
 * All workspace-scoped routes require JWT auth and workspace membership.
 */

import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../common/guards/role.guard';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { WhiteLabelService } from './white-label.service';
import { UpdateWhiteLabelConfigDto } from './dto/update-white-label-config.dto';
import { SetCustomDomainDto } from './dto/set-custom-domain.dto';
import { WhiteLabelConfigResponseDto } from './dto/white-label-config-response.dto';

@ApiTags('White-Label')
@ApiBearerAuth('JWT-auth')
@Controller('api/workspaces/:workspaceId/white-label')
@UseGuards(JwtAuthGuard, RoleGuard)
export class WhiteLabelController {
  constructor(private readonly whiteLabelService: WhiteLabelService) {}

  /**
   * GET /api/workspaces/:workspaceId/white-label
   * Returns white-label config for the workspace.
   * Requires: workspace member (any role can read config)
   */
  @Get()
  @ApiOperation({ summary: 'Get white-label configuration for workspace' })
  @ApiResponse({ status: 200, description: 'White-label config returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<WhiteLabelConfigResponseDto | null> {
    const config = await this.whiteLabelService.getConfig(workspaceId);
    return config ? WhiteLabelConfigResponseDto.fromEntity(config) : null;
  }

  /**
   * PUT /api/workspaces/:workspaceId/white-label
   * Create or update white-label config.
   * Requires: workspace owner or admin role
   */
  @Put()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Create or update white-label configuration' })
  @ApiResponse({ status: 200, description: 'White-label config updated' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner or Admin required' })
  async upsertConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateWhiteLabelConfigDto,
    @Req() req: any,
  ): Promise<WhiteLabelConfigResponseDto> {
    const config = await this.whiteLabelService.upsertConfig(workspaceId, dto, req.user.id);
    return WhiteLabelConfigResponseDto.fromEntity(config);
  }

  /**
   * POST /api/workspaces/:workspaceId/white-label/logo
   * Upload logo (primary or dark variant).
   * Requires: workspace owner or admin role
   */
  @Post('logo')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'variant', enum: ['primary', 'dark'], required: true })
  @ApiOperation({ summary: 'Upload logo for white-label branding' })
  @ApiResponse({ status: 201, description: 'Logo uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadLogo(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('variant') variant: string,
    @Req() req: any,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (variant !== 'primary' && variant !== 'dark') {
      throw new BadRequestException('variant must be "primary" or "dark"');
    }

    return this.whiteLabelService.uploadLogo(workspaceId, file, variant, req.user.id);
  }

  /**
   * POST /api/workspaces/:workspaceId/white-label/favicon
   * Upload favicon.
   * Requires: workspace owner or admin role
   */
  @Post('favicon')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload favicon for white-label branding' })
  @ApiResponse({ status: 201, description: 'Favicon uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadFavicon(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.whiteLabelService.uploadFavicon(workspaceId, file, req.user.id);
  }

  /**
   * POST /api/workspaces/:workspaceId/white-label/domain
   * Set custom domain and get verification instructions.
   * Requires: workspace owner only
   */
  @Post('domain')
  @RequireRole(WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Set custom domain for white-label branding' })
  @ApiResponse({ status: 201, description: 'Domain set, verification instructions returned' })
  @ApiResponse({ status: 400, description: 'Invalid domain or reserved domain' })
  @ApiResponse({ status: 409, description: 'Domain already in use' })
  async setDomain(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: SetCustomDomainDto,
    @Req() req: any,
  ): Promise<{ verificationToken: string; cnameTarget: string; txtRecord: string }> {
    return this.whiteLabelService.setCustomDomain(workspaceId, dto.domain, req.user.id);
  }

  /**
   * POST /api/workspaces/:workspaceId/white-label/domain/verify
   * Verify custom domain DNS records.
   * Requires: workspace owner only
   */
  @Post('domain/verify')
  @RequireRole(WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Verify custom domain DNS configuration' })
  @ApiResponse({ status: 200, description: 'Verification result returned' })
  async verifyDomain(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: any,
  ): Promise<{ verified: boolean; cnameValid: boolean; txtValid: boolean; errors: string[] }> {
    return this.whiteLabelService.verifyDomain(workspaceId, req.user.id);
  }

  /**
   * DELETE /api/workspaces/:workspaceId/white-label/domain
   * Remove custom domain.
   * Requires: workspace owner only
   */
  @Delete('domain')
  @RequireRole(WorkspaceRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove custom domain' })
  @ApiResponse({ status: 204, description: 'Domain removed' })
  async removeDomain(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: any,
  ): Promise<void> {
    return this.whiteLabelService.removeDomain(workspaceId, req.user.id);
  }

  /**
   * POST /api/workspaces/:workspaceId/white-label/reset
   * Reset config to DevOS defaults.
   * Requires: workspace owner or admin role
   */
  @Post('reset')
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Reset white-label config to DevOS defaults' })
  @ApiResponse({ status: 200, description: 'Config reset to defaults' })
  async resetToDefaults(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: any,
  ): Promise<WhiteLabelConfigResponseDto> {
    const config = await this.whiteLabelService.resetToDefaults(workspaceId, req.user.id);
    return WhiteLabelConfigResponseDto.fromEntity(config);
  }
}

/**
 * White-Label Public Controller
 * Separate controller without auth guards for public domain resolution.
 */
@ApiTags('White-Label')
@Controller('api/white-label')
export class WhiteLabelPublicController {
  constructor(private readonly whiteLabelService: WhiteLabelService) {}

  /**
   * GET /api/white-label/resolve/:domain
   * Public endpoint: Resolve custom domain to workspace config (no auth required).
   * Used by frontend to detect white-label on page load.
   */
  @Get('resolve/:domain')
  @ApiOperation({ summary: 'Resolve custom domain to white-label config (public)' })
  @ApiResponse({ status: 200, description: 'Config returned or null' })
  async resolveDomain(
    @Param('domain') domain: string,
  ): Promise<WhiteLabelConfigResponseDto | null> {
    const config = await this.whiteLabelService.getConfigByDomain(domain);
    return config ? WhiteLabelConfigResponseDto.fromEntity(config) : null;
  }
}
