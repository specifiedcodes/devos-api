/**
 * TemplatesController
 *
 * Story 19-1: Template Registry Backend
 * Story 19-3: Parameterized Scaffolding
 * Story 19-9: Template Analytics (view tracking integration)
 *
 * REST API endpoints for template management.
 * Extends original Story 4.2 endpoints with CRUD operations.
 */
import {
  Controller,
  Get,
  Post,
  Put,
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
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { TemplatesService } from '../services/templates.service';
import { TemplateRegistryService } from '../services/template-registry.service';
import { TemplateScaffoldingService } from '../services/template-scaffolding.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { ListTemplatesQueryDto } from '../dto/list-templates-query.dto';
import {
  TemplateResponseDto,
  TemplateListResponseDto,
  TemplateCategoriesResponseDto,
} from '../dto/template-response.dto';
import { Template, TemplateCategory } from '../../../database/entities/template.entity';
import { TemplateAnalyticsService } from '../services/template-analytics.service';
import { TemplateAnalyticsEventType } from '../../../database/entities/template-analytics-event.entity';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    workspaceId?: string;
  };
}

@ApiTags('Templates')
@Controller('api/v1/templates')
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly templateRegistryService: TemplateRegistryService,
    private readonly templateScaffoldingService: TemplateScaffoldingService,
    private readonly templateAnalyticsService: TemplateAnalyticsService,
  ) {}

  /**
   * GET /api/v1/templates
   * List all templates (paginated, filterable)
   * Public endpoint for published/official templates
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List all templates',
    description:
      'Returns paginated list of templates. Public templates (official and published) are visible to all users. Authenticated users can also see their workspace templates.',
  })
  @ApiQuery({ name: 'category', enum: TemplateCategory, required: false })
  @ApiQuery({ name: 'tag', type: String, required: false })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiQuery({ name: 'isOfficial', type: Boolean, required: false })
  @ApiQuery({ name: 'isPublished', type: Boolean, required: false })
  @ApiQuery({ name: 'sortBy', enum: ['createdAt', 'updatedAt', 'name', 'totalUses', 'avgRating'], required: false })
  @ApiQuery({ name: 'sortOrder', enum: ['ASC', 'DESC'], required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: 'List of templates',
    type: TemplateListResponseDto,
  })
  async listTemplates(
    @Query() query: ListTemplatesQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TemplateListResponseDto> {
    // Add workspace context for authenticated users
    const workspaceId = req.user?.workspaceId;

    const result = await this.templateRegistryService.list({
      ...query,
      workspaceId,
    });

    const items = result.items.map((t) => this.toResponseDto(t));

    return {
      items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * GET /api/v1/templates/categories
   * List categories with template counts
   */
  @Get('categories')
  @ApiOperation({
    summary: 'List template categories with counts',
    description: 'Returns all categories with the number of templates in each.',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories with counts',
    type: TemplateCategoriesResponseDto,
  })
  async getCategories(): Promise<TemplateCategoriesResponseDto> {
    const categories = await this.templateRegistryService.getCategories();
    return { categories };
  }

  /**
   * GET /api/v1/templates/featured
   * Get featured templates
   */
  @Get('featured')
  @ApiOperation({
    summary: 'Get featured templates',
    description: 'Returns official templates sorted by rating and usage.',
  })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Featured templates',
    type: [TemplateResponseDto],
  })
  async getFeatured(@Query('limit') limit?: string): Promise<TemplateResponseDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const templates = await this.templateRegistryService.getFeatured(parsedLimit);
    return templates.map((t) => this.toResponseDto(t));
  }

  /**
   * GET /api/v1/templates/trending
   * Get trending templates
   */
  @Get('trending')
  @ApiOperation({
    summary: 'Get trending templates',
    description: 'Returns templates sorted by recent usage and rating.',
  })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Trending templates',
    type: [TemplateResponseDto],
  })
  async getTrending(@Query('limit') limit?: string): Promise<TemplateResponseDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const templates = await this.templateRegistryService.getTrending(parsedLimit);
    return templates.map((t) => this.toResponseDto(t));
  }

  /**
   * GET /api/v1/templates/:id
   * Get template by ID
   * Accepts both UUID format and legacy slug identifiers for backward compatibility
   */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get template by ID',
    description:
      'Returns a single template by its unique identifier. Public for official/published templates. Auth required for private workspace templates. Supports both UUID and legacy slug identifiers.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID or legacy slug identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Template found',
    type: TemplateResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
    schema: {
      example: {
        statusCode: 404,
        message: "Template with ID 'invalid-id' not found",
        error: 'Not Found',
      },
    },
  })
  async getTemplateById(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TemplateResponseDto> {
    // Try database first (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(id)) {
      const template = await this.templateRegistryService.findById(id);
      if (template) {
        // Story 19-9: Track detail_view event (fire-and-forget)
        // Only track when workspaceId is available (valid UUID FK constraint)
        if (req.user?.workspaceId) {
          this.templateAnalyticsService.trackEvent({
            templateId: id,
            workspaceId: req.user.workspaceId,
            userId: req.user?.id || null,
            eventType: TemplateAnalyticsEventType.DETAIL_VIEW,
            referrer: req.headers?.referer || null,
          }).catch(() => { /* fire-and-forget */ });
        }

        return this.toResponseDto(template);
      }
    }

    // Fallback to legacy service (hardcoded templates)
    // This maintains backward compatibility with Story 4.2
    return this.templatesService.getTemplateById(id);
  }

  /**
   * POST /api/v1/templates
   * Create a new template (Auth required)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new template',
    description:
      'Creates a new template in the workspace. Requires developer role or higher.',
  })
  @ApiResponse({
    status: 201,
    description: 'Template created',
    type: TemplateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - template name already exists',
  })
  async createTemplate(
    @Body() dto: CreateTemplateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TemplateResponseDto> {
    const workspaceId = req.user?.workspaceId || null;
    const userId = req.user.id;

    const template = await this.templateRegistryService.create(
      workspaceId,
      dto,
      userId,
    );

    return this.toResponseDto(template);
  }

  /**
   * PUT /api/v1/templates/:id
   * Update a template (Auth required)
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a template',
    description:
      'Updates an existing template. Only creator or workspace admin can update.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Template updated',
    type: TemplateResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<TemplateResponseDto> {
    const userId = req.user.id;
    const template = await this.templateRegistryService.update(id, dto, userId);
    return this.toResponseDto(template);
  }

  /**
   * DELETE /api/v1/templates/:id
   * Delete a template (Auth required)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a template',
    description:
      'Deletes a template. Only creator or workspace admin can delete.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 204,
    description: 'Template deleted',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  async deleteTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const userId = req.user.id;
    await this.templateRegistryService.delete(id, userId);
  }

  /**
   * POST /api/v1/templates/:id/publish
   * Publish a template (Auth required)
   */
  @Post(':id/publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Publish a template',
    description:
      'Publishes a template to the marketplace. Only creator or workspace admin can publish.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Template published',
    type: TemplateResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  async publishTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TemplateResponseDto> {
    const userId = req.user.id;
    const template = await this.templateRegistryService.publish(id, userId);
    return this.toResponseDto(template);
  }

  /**
   * POST /api/v1/templates/:id/unpublish
   * Unpublish a template (Auth required)
   */
  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Unpublish a template',
    description:
      'Removes a template from the marketplace. Only creator or workspace admin can unpublish.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Template unpublished',
    type: TemplateResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  async unpublishTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<TemplateResponseDto> {
    const userId = req.user.id;
    const template = await this.templateRegistryService.unpublish(id, userId);
    return this.toResponseDto(template);
  }

  /**
   * POST /api/v1/templates/:id/use
   * Record template usage (Internal)
   */
  @Post(':id/use')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record template usage',
    description: 'Increments the usage counter for a template. Called when a project is created from the template.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 204,
    description: 'Usage recorded',
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  async recordUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const workspaceId = req.user?.workspaceId;
    await this.templateRegistryService.incrementUsage(id, workspaceId);
  }

  /**
   * GET /api/v1/templates/category/:category
   * Get templates by category (Legacy endpoint from Story 4.2)
   */
  @Get('category/:category')
  @ApiOperation({
    summary: 'Get templates by category (legacy)',
    description:
      'Returns templates filtered by category. This endpoint is maintained for backward compatibility.',
  })
  @ApiParam({
    name: 'category',
    description: 'Template category',
    enum: TemplateCategory,
    example: 'saas',
  })
  @ApiResponse({
    status: 200,
    description: 'Templates matching category',
    type: [TemplateResponseDto],
  })
  async getTemplatesByCategory(
    @Param('category') category: TemplateCategory,
  ): Promise<TemplateResponseDto[]> {
    // First try database templates
    const dbTemplates = await this.templateRegistryService.findByCategory(category);
    if (dbTemplates.length > 0) {
      return dbTemplates.map((t) => this.toResponseDto(t));
    }

    // Fallback to legacy hardcoded templates
    return this.templatesService.getTemplatesByCategory(category);
  }

  /**
   * Convert Template entity to response DTO
   */
  private toResponseDto(template: Template | Record<string, unknown>): TemplateResponseDto {
    // Handle both Template entity and legacy ProjectTemplate
    const isTemplateEntity = 'id' in template && typeof template.id === 'string' && template.id.includes('-');

    const dto: TemplateResponseDto = {
      id: template.id as string,
      templateId: template.name as string, // For backward compatibility
      name: template.name as string,
      displayName: template.displayName as string,
      description: template.description as string | undefined,
      longDescription: template.longDescription as string | undefined,
      version: template.version as string,
      schemaVersion: template.schemaVersion as string | undefined,
      category: template.category as TemplateCategory,
      tags: template.tags as string[],
      icon: template.icon as string | undefined,
      screenshots: template.screenshots as string[] | undefined,
      definition: template.definition as TemplateResponseDto['definition'],
      stackSummary: template.stackSummary as TemplateResponseDto['stackSummary'],
      sourceType: template.sourceType as string | undefined,
      sourceUrl: template.sourceUrl as string | undefined,
      sourceBranch: template.sourceBranch as string | undefined,
      isOfficial: template.isOfficial as boolean | undefined,
      isPublished: template.isPublished as boolean | undefined,
      isActive: template.isActive as boolean | undefined,
      recommended: (template.isOfficial as boolean) && template.name === 'nextjs-saas-starter',
      // Story 19-8: Featured Templates Curation
      isFeatured: template.isFeatured as boolean | undefined,
      featuredOrder: template.featuredOrder as number | undefined,
      testStatus: template.testStatus as string | undefined,
      lastTestRunAt: (template.lastTestRunAt as Date)?.toISOString?.(),
      totalUses: template.totalUses as number | undefined,
      avgRating: template.avgRating != null ? Number(template.avgRating) : 0,
      ratingCount: template.ratingCount as number | undefined,
      createdAt: (template.createdAt as Date)?.toISOString?.(),
      updatedAt: (template.updatedAt as Date)?.toISOString?.(),
    };

    // Map definition.stack to legacy techStack format for backward compatibility
    const definition = template.definition as { stack?: Record<string, string> } | undefined;
    if (definition?.stack) {
      dto.techStack = {
        framework: definition.stack.frontend || '',
        language: 'TypeScript',
        styling: definition.stack.styling,
        database: definition.stack.database,
        apiLayer: definition.stack.backend,
        testing: [],
        additional: [],
      };
    }

    // Add defaultPreferences for backward compatibility
    dto.defaultPreferences = {
      repoStructure: 'polyrepo',
      codeStyle: 'ESLint + Prettier',
      testingStrategy: 'Jest',
    };

    return dto;
  }

  // ==================== Story 19-3: Scaffolding Endpoints ====================

  /**
   * POST /api/v1/templates/:id/scaffold
   * Scaffold a project from a template
   */
  @Post(':id/scaffold')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Scaffold a project from a template',
    description: 'Creates a new project from the template with user-provided variables. Returns job ID for async processing.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 202,
    description: 'Scaffolding job started',
    schema: {
      example: {
        jobId: 'scaffold-123',
        status: 'pending',
        message: 'Scaffolding job started',
        statusUrl: '/api/v1/templates/scaffold/jobs/scaffold-123',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Preview generated (dry run)',
    schema: {
      example: {
        preview: {
          fileCount: 10,
          files: [],
          postInstallScripts: ['npm install'],
          estimatedTime: '2-5 minutes',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Variable validation failed',
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  async scaffoldTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: import('../dto/scaffold-template.dto').ScaffoldTemplateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    const userId = req.user.id;
    const workspaceId = dto.workspaceId || req.user?.workspaceId;

    return this.templateScaffoldingService.scaffold(workspaceId, userId, {
      templateId: id,
      projectName: dto.projectName,
      variables: dto.variables,
      githubRepoId: dto.githubRepoId,
      createNewRepo: dto.createNewRepo,
      repoName: dto.repoName,
      repoPrivate: dto.repoPrivate,
      repoDescription: dto.repoDescription,
      skipPostInstall: dto.skipPostInstall,
      dryRun: dto.dryRun,
    });
  }

  /**
   * POST /api/v1/templates/:id/validate
   * Validate variables against template definition
   */
  @Post(':id/validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Validate variables against template',
    description: 'Validates user-provided variables against the template variable definitions.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
  })
  async validateVariables(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: import('../dto/scaffold-template.dto').ValidateVariablesDto,
  ): Promise<import('../dto/scaffold-template.dto').ValidationResultDto> {
    const template = await this.templateRegistryService.findById(id);
    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    return this.templateScaffoldingService.validateVariables(template, dto.variables);
  }

  /**
   * GET /api/v1/templates/scaffold/jobs/:jobId
   * Get scaffolding job status
   */
  @Get('scaffold/jobs/:jobId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get scaffolding job status',
    description: 'Returns the current status of a scaffolding job.',
  })
  @ApiParam({
    name: 'jobId',
    description: 'Job ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Job status',
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found',
  })
  async getScaffoldJobStatus(
    @Param('jobId') jobId: string,
  ): Promise<import('../dto/scaffold-template.dto').ScaffoldJobStatusDto> {
    const status = await this.templateScaffoldingService.getJobStatus(jobId);
    if (!status) {
      throw new NotFoundException(`Job with ID '${jobId}' not found`);
    }
    return status as any;
  }

  /**
   * POST /api/v1/templates/scaffold/jobs/:jobId/cancel
   * Cancel a scaffolding job
   */
  @Post('scaffold/jobs/:jobId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Cancel a scaffolding job',
    description: 'Cancels a running scaffolding job.',
  })
  @ApiParam({
    name: 'jobId',
    description: 'Job ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Job cancelled',
    schema: {
      example: { success: true, status: 'cancelled' },
    },
  })
  async cancelScaffoldJob(
    @Param('jobId') jobId: string,
  ): Promise<{ success: boolean; status: string }> {
    const success = await this.templateScaffoldingService.cancelJob(jobId);
    return { success, status: success ? 'cancelled' : 'not_found' };
  }
}
