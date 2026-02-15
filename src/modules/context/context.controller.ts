/**
 * ContextController
 * Story 12.4: Three-Tier Context Recovery Enhancement
 *
 * REST API controller for context generation operations.
 * Provides manual context refresh endpoint.
 */
import {
  Controller,
  Post,
  Param,
  UseGuards,
  Logger,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContextGenerationService } from './services/context-generation.service';
import { ContextRefreshResult, ProjectMetadata } from './interfaces/context-generation.interfaces';
import { ConfigService } from '@nestjs/config';

@ApiTags('context')
@ApiBearerAuth()
@Controller('api/v1/context')
@UseGuards(JwtAuthGuard)
export class ContextController {
  private readonly logger = new Logger(ContextController.name);

  constructor(
    private readonly contextGenerationService: ContextGenerationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Manually trigger regeneration of all three context tiers for a project.
   */
  @Post('refresh/:projectId')
  @ApiOperation({
    summary: 'Refresh all context tiers for a project',
    description:
      'Manually triggers regeneration of .devoscontext (Tier 1), DEVOS.md (Tier 2). ' +
      'Tier 3 (project-state.yaml) is append-only and not modified by manual refresh.',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({
    status: 200,
    description: 'Context refresh result',
  })
  @ApiResponse({
    status: 404,
    description: 'Project not found',
  })
  async refreshContext(
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ): Promise<ContextRefreshResult> {
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

    return this.contextGenerationService.refreshAllTiers(
      projectId,
      'default',
      workspacePath,
      metadata,
    );
  }
}
