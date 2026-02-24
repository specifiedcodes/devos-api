/**
 * Template Version Controller
 *
 * Story 19-7: Template Versioning
 *
 * API endpoints for template version management.
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TemplateVersionService } from '../services/template-version.service';
import { PublishTemplateVersionDto } from '../dto/publish-template-version.dto';
import { ListVersionsQueryDto } from '../dto/list-versions-query.dto';
import {
  TemplateVersionResponseDto,
  TemplateVersionListResponseDto,
} from '../dto/template-version-response.dto';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    id?: string;
    [key: string]: any;
  };
}

@ApiTags('Template Versions')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/templates/:templateId/versions')
@UseGuards(JwtAuthGuard)
export class TemplateVersionController {
  constructor(private readonly versionService: TemplateVersionService) {}

  private getUserId(req: RequestWithUser): string {
    return req.user.sub || req.user.id || '';
  }

  @Post()
  @ApiOperation({ summary: 'Publish a new version of a template' })
  @ApiBody({ type: PublishTemplateVersionDto })
  @ApiParam({ name: 'templateId', description: 'Template ID', format: 'uuid' })
  @ApiResponse({
    status: 201,
    description: 'Version published successfully',
    type: TemplateVersionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid version format or version not greater than existing' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({ status: 409, description: 'Version already exists' })
  async publishVersion(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Req() req: RequestWithUser,
    @Body() dto: PublishTemplateVersionDto,
  ): Promise<TemplateVersionResponseDto> {
    const userId = this.getUserId(req);
    const version = await this.versionService.publishVersion(
      templateId,
      userId,
      req.body.workspaceId || null,
      dto,
    );
    return {
      id: version.id,
      templateId: version.templateId,
      version: version.version,
      changelog: version.changelog,
      definition: version.definition,
      isLatest: version.isLatest,
      downloadCount: version.downloadCount,
      publishedBy: version.publishedBy,
      publishedAt: version.publishedAt,
      createdAt: version.createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all versions of a template' })
  @ApiParam({ name: 'templateId', description: 'Template ID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'List of template versions',
    type: TemplateVersionListResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async listVersions(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Query() query: ListVersionsQueryDto,
  ): Promise<TemplateVersionListResponseDto> {
    return this.versionService.listVersions(templateId, query);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get the latest version of a template' })
  @ApiParam({ name: 'templateId', description: 'Template ID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Latest template version',
    type: TemplateVersionResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  async getLatestVersion(
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ): Promise<TemplateVersionResponseDto> {
    const version = await this.versionService.getLatestVersion(templateId);
    if (!version) {
      throw new NotFoundException(`No versions found for template ${templateId}`);
    }
    return {
      id: version.id,
      templateId: version.templateId,
      version: version.version,
      changelog: version.changelog,
      definition: version.definition,
      isLatest: version.isLatest,
      downloadCount: version.downloadCount,
      publishedBy: version.publishedBy,
      publishedAt: version.publishedAt,
      createdAt: version.createdAt,
    };
  }

  @Get(':version')
  @ApiOperation({ summary: 'Get a specific version of a template' })
  @ApiParam({ name: 'templateId', description: 'Template ID', format: 'uuid' })
  @ApiParam({ name: 'version', description: 'Version number (semver)', example: '1.0.0' })
  @ApiResponse({
    status: 200,
    description: 'Template version details',
    type: TemplateVersionResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid version format' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async getVersion(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('version') version: string,
  ): Promise<TemplateVersionResponseDto> {
    return this.versionService.getVersion(templateId, version);
  }

  @Delete(':version')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template version' })
  @ApiParam({ name: 'templateId', description: 'Template ID', format: 'uuid' })
  @ApiParam({ name: 'version', description: 'Version number (semver)', example: '1.0.0' })
  @ApiResponse({ status: 204, description: 'Version deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete latest or only version' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async deleteVersion(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('version') version: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    const userId = this.getUserId(req);
    await this.versionService.deleteVersion(templateId, version, userId);
  }
}
