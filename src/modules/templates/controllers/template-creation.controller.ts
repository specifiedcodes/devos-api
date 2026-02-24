/**
 * TemplateCreationController
 *
 * Story 19-2: Template Creation Wizard (AC1)
 *
 * REST API endpoints for template creation wizard.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TemplateCreationService, FileContent, DetectedPattern } from '../services/template-creation.service';
import { CreateTemplateFromProjectDto } from '../dto/create-template-from-project.dto';
import { Template } from '../../../database/entities/template.entity';

@ApiTags('templates')
@ApiBearerAuth('JWT-auth')
@Controller('workspaces/:workspaceId/templates/creation')
@UseGuards(JwtAuthGuard)
export class TemplateCreationController {
  constructor(private readonly templateCreationService: TemplateCreationService) {}

  /**
   * Create a template from an existing project.
   * POST /workspaces/:workspaceId/templates/creation/from-project
   */
  @Post('from-project')
  @ApiOperation({ summary: 'Create template from project' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate name' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async createFromProject(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: { user: { sub: string } },
    @Body() dto: CreateTemplateFromProjectDto,
  ): Promise<Template> {
    return this.templateCreationService.createFromProject(
      workspaceId,
      req.user.sub,
      dto,
    );
  }

  /**
   * Create a template from a GitHub repository.
   * POST /workspaces/:workspaceId/templates/creation/from-github
   */
  @Post('from-github')
  @ApiOperation({ summary: 'Create template from GitHub repository' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or duplicate name' })
  @ApiResponse({ status: 403, description: 'GitHub not connected or insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Repository not found' })
  async createFromGitHub(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: { user: { sub: string } },
    @Body() dto: CreateTemplateFromProjectDto,
  ): Promise<Template> {
    return this.templateCreationService.createFromGitHub(
      workspaceId,
      req.user.sub,
      dto,
    );
  }

  /**
   * Detect patterns in files for templatization.
   * POST /workspaces/:workspaceId/templates/creation/detect-patterns
   */
  @Post('detect-patterns')
  @ApiOperation({ summary: 'Detect patterns in files' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Patterns detected' })
  @ApiResponse({ status: 400, description: 'Invalid input - files array required' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async detectPatterns(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: { user: { sub: string } },
    @Body() body: { files: FileContent[] },
  ): Promise<{ patterns: DetectedPattern[] }> {
    // Validate input
    if (!body.files || !Array.isArray(body.files)) {
      throw new BadRequestException('files array is required');
    }

    // Validate workspace membership
    await this.templateCreationService.validateWorkspaceAccess(workspaceId, req.user.sub);

    const patterns = await this.templateCreationService.detectPatterns(body.files);
    return { patterns };
  }

  /**
   * Get file tree preview for a source.
   * POST /workspaces/:workspaceId/templates/creation/file-tree
   */
  @Post('file-tree')
  @ApiOperation({ summary: 'Get file tree preview' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'File tree preview' })
  @ApiResponse({ status: 400, description: 'Invalid input - source required' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getFileTreePreview(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: { user: { sub: string } },
    @Body() body: {
      source: { type: string; projectId?: string; githubUrl?: string; branch?: string };
      includePaths?: string[];
      excludePaths?: string[];
    },
  ): Promise<{
    tree: any[];
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
  }> {
    // Validate input
    if (!body.source || !body.source.type) {
      throw new BadRequestException('source with type is required');
    }

    // Validate workspace membership
    await this.templateCreationService.validateWorkspaceAccess(workspaceId, req.user.sub);

    return this.templateCreationService.getFileTreePreview(
      body.source as any,
      workspaceId,
      body.includePaths,
      body.excludePaths,
    );
  }

  /**
   * Get file contents for pattern detection.
   * POST /workspaces/:workspaceId/templates/creation/file-contents
   */
  @Post('file-contents')
  @ApiOperation({ summary: 'Get file contents' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'File contents' })
  @ApiResponse({ status: 400, description: 'Invalid input - source required' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getFileContents(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: { user: { sub: string } },
    @Body() body: {
      source: { type: string; projectId?: string; githubUrl?: string; branch?: string };
      includePaths?: string[];
      excludePaths?: string[];
    },
  ): Promise<{ files: FileContent[] }> {
    // Validate input
    if (!body.source || !body.source.type) {
      throw new BadRequestException('source with type is required');
    }

    // Validate workspace membership
    await this.templateCreationService.validateWorkspaceAccess(workspaceId, req.user.sub);

    const files = await this.templateCreationService.getFileContents(
      body.source as any,
      workspaceId,
      body.includePaths,
      body.excludePaths,
    );
    return { files };
  }

  /**
   * Apply templatization patterns to files.
   * POST /workspaces/:workspaceId/templates/creation/templatize
   */
  @Post('templatize')
  @ApiOperation({ summary: 'Apply templatization patterns' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Templatized files' })
  @ApiResponse({ status: 400, description: 'Invalid input - files and patterns required' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async applyTemplatization(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: { user: { sub: string } },
    @Body() body: {
      files: FileContent[];
      patterns: Array<{ pattern: string; variable: string; files?: string[] }>;
    },
  ): Promise<{ files: FileContent[] }> {
    // Validate input
    if (!body.files || !Array.isArray(body.files)) {
      throw new BadRequestException('files array is required');
    }
    if (!body.patterns || !Array.isArray(body.patterns)) {
      throw new BadRequestException('patterns array is required');
    }

    // Validate workspace membership
    await this.templateCreationService.validateWorkspaceAccess(workspaceId, req.user.sub);

    const files = await this.templateCreationService.applyTemplatization(
      body.files,
      body.patterns,
    );
    return { files };
  }
}
