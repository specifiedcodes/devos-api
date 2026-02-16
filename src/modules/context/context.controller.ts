/**
 * ContextController
 * Story 12.4: Three-Tier Context Recovery Enhancement
 * Story 12.5: Context Health Indicators UI
 *
 * REST API controller for context generation and health operations.
 * Provides manual context refresh endpoint and health assessment endpoint.
 */
import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseBoolPipe,
  Post,
  Param,
  Query,
  UseGuards,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContextGenerationService } from './services/context-generation.service';
import { ContextHealthService } from './services/context-health.service';
import { ProjectMetadata } from './interfaces/context-generation.interfaces';
import {
  ContextHealth,
  ContextRefreshWithHealth,
} from './interfaces/context-health.interfaces';
import { ConfigService } from '@nestjs/config';

@ApiTags('Context')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/context')
@UseGuards(JwtAuthGuard)
export class ContextController {
  private readonly logger = new Logger(ContextController.name);

  constructor(
    private readonly contextGenerationService: ContextGenerationService,
    private readonly contextHealthService: ContextHealthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get context health assessment for a project.
   * Story 12.5: Context Health Indicators UI
   */
  @Get('health/:projectId')
  @ApiOperation({
    summary: 'Get context health for a project',
    description:
      'Returns aggregated health status of all three context tiers ' +
      'plus Graphiti connectivity for the specified project.',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiQuery({
    name: 'forceRefresh',
    required: false,
    description: 'Bypass cache and force fresh assessment',
  })
  @ApiResponse({
    status: 200,
    description: 'Context health assessment',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  async getHealth(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Query('forceRefresh', new DefaultValuePipe(false), ParseBoolPipe) forceRefresh: boolean,
  ): Promise<ContextHealth> {
    this.logger.log(`Context health requested for project ${projectId}`);

    const basePath = this.configService.get<string>(
      'CLI_WORKSPACE_BASE_PATH',
      '/workspaces',
    );
    const workspacePath = `${basePath}/default/${projectId}`;

    return this.contextHealthService.assessHealth(
      projectId,
      'default',
      workspacePath,
      forceRefresh,
    );
  }

  /**
   * Manually trigger regeneration of all three context tiers for a project.
   * Story 12.5: Enhanced to return health alongside refresh result.
   */
  @Post('refresh/:projectId')
  @ApiOperation({
    summary: 'Refresh all context tiers for a project',
    description:
      'Manually triggers regeneration of .devoscontext (Tier 1), DEVOS.md (Tier 2). ' +
      'Tier 3 (project-state.yaml) is append-only and not modified by manual refresh. ' +
      'Returns health assessment alongside refresh result.',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({
    status: 200,
    description: 'Context refresh result with health assessment',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  async refreshContext(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ): Promise<ContextRefreshWithHealth> {
    this.logger.log(`Manual context refresh requested for project ${projectId}`);

    // Resolve workspace path from config
    // TODO: In production, inject ProjectsService to look up actual workspace details
    const basePath = this.configService.get<string>(
      'CLI_WORKSPACE_BASE_PATH',
      '/workspaces',
    );

    // Build default metadata for refresh
    // TODO: In production, retrieve from project entity via ProjectsService
    const metadata: ProjectMetadata = {
      name: 'DevOS Project',
      description: 'AI-powered development platform',
      techStack: 'NestJS, TypeScript, PostgreSQL, Redis',
      conventions: 'ESLint, Prettier, TDD',
      architectureSummary: 'Modular NestJS architecture with microservice patterns',
    };

    // Use default workspace until ProjectsService integration is available
    const workspacePath = `${basePath}/default/${projectId}`;

    const refresh = await this.contextGenerationService.refreshAllTiers(
      projectId,
      'default',
      workspacePath,
      metadata,
    );

    // Story 12.5: Invalidate cache and assess health after refresh
    await this.contextHealthService.invalidateCache(projectId);
    const health = await this.contextHealthService.assessHealth(
      projectId,
      'default',
      workspacePath,
      true, // force refresh to get fresh assessment
    );

    return { refresh, health };
  }
}
