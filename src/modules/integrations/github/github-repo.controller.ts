import {
  Controller,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Req,
  Logger,
  ForbiddenException,
  NotFoundException,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { GitHubService } from './github.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { Project } from '../../../database/entities/project.entity';
import { CreateRepoDto } from './dto/create-repo.dto';
import { LinkRepoDto } from './dto/repo-response.dto';
import {
  GitHubRepoResponseDto,
  LinkRepoResponseDto,
} from './dto/repo-response.dto';

/**
 * GitHubRepoController
 * Story 6.2: GitHub Repository Creation
 *
 * Handles GitHub repository creation and linking endpoints.
 * Separated from IntegrationController to keep repo-specific logic isolated.
 */
@ApiTags('GitHub Repositories')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class GitHubRepoController {
  private readonly logger = new Logger(GitHubRepoController.name);

  constructor(
    private readonly gitHubService: GitHubService,
    private readonly integrationConnectionService: IntegrationConnectionService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a GitHub repository
   * POST /api/v1/workspaces/:workspaceId/integrations/github/repos
   *
   * @param workspaceId - Workspace ID from URL
   * @param dto - Repository creation options
   * @param req - Request with authenticated user
   * @returns GitHubRepoResponseDto
   */
  @Post('integrations/github/repos')
  @HttpCode(HttpStatus.CREATED)
  async createRepository(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateRepoDto,
    @Req() req: any,
  ): Promise<GitHubRepoResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Creating GitHub repository "${dto.name}" for workspace ${workspaceId.substring(0, 8)}...`,
    );

    // Get decrypted GitHub token for this workspace
    let token: string;
    try {
      token = await this.integrationConnectionService.getDecryptedToken(
        workspaceId,
        IntegrationProvider.GITHUB,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException(
          'GitHub integration not connected for this workspace',
        );
      }
      throw error;
    }

    // Create repository via GitHub API
    const repo = await this.gitHubService.createRepository(token, dto.name, {
      description: dto.description,
      private: dto.private,
      autoInit: dto.autoInit,
      gitignoreTemplate: dto.gitignoreTemplate,
      licenseTemplate: dto.licenseTemplate,
    });

    // Log audit event
    await this.auditService.log(
      workspaceId,
      userId,
      AuditAction.CREATE,
      'integration',
      repo.name,
      {
        action: 'integration.github.repo_created',
        repoName: repo.name,
        repoFullName: repo.fullName,
        repoUrl: repo.htmlUrl,
        private: repo.private,
      },
    );

    this.logger.log(
      `GitHub repository created: ${repo.fullName} (${repo.htmlUrl})`,
    );

    return repo;
  }

  /**
   * Link an existing GitHub repository to a project
   * PUT /api/v1/workspaces/:workspaceId/projects/:projectId/github-repo
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param dto - Link repo DTO with repoUrl
   * @param req - Request with authenticated user
   * @returns LinkRepoResponseDto
   */
  @Put('projects/:projectId/github-repo')
  async linkRepository(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: LinkRepoDto,
    @Req() req: any,
  ): Promise<LinkRepoResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Linking GitHub repository to project ${projectId.substring(0, 8)}...`,
    );

    // Verify project exists in this workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    // Get decrypted GitHub token
    let token: string;
    try {
      token = await this.integrationConnectionService.getDecryptedToken(
        workspaceId,
        IntegrationProvider.GITHUB,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException(
          'GitHub integration not connected for this workspace',
        );
      }
      throw error;
    }

    // Parse owner and repo name from URL (strip trailing slashes and filter empty segments)
    const urlParts = dto.repoUrl
      .replace('https://github.com/', '')
      .replace(/\/+$/, '')
      .split('/')
      .filter((part) => part.length > 0);
    const owner = urlParts[0];
    const repoName = urlParts[1];

    if (!owner || !repoName) {
      throw new NotFoundException(
        'Invalid GitHub repository URL: could not parse owner and repo name',
      );
    }

    // Verify repo exists and is accessible
    const repo = await this.gitHubService.getRepository(token, owner, repoName);

    if (!repo) {
      throw new NotFoundException(
        'Repository not found on GitHub or not accessible',
      );
    }

    // Update project's githubRepoUrl
    await this.projectRepository.update(projectId, {
      githubRepoUrl: dto.repoUrl,
    });

    // Log audit event
    await this.auditService.log(
      workspaceId,
      userId,
      AuditAction.UPDATE,
      'integration',
      projectId,
      {
        action: 'integration.github.repo_linked',
        projectId,
        repoUrl: dto.repoUrl,
        repoName: repo.name,
        repoFullName: repo.fullName,
      },
    );

    this.logger.log(
      `GitHub repository linked to project ${projectId.substring(0, 8)}...: ${dto.repoUrl}`,
    );

    return {
      success: true,
      githubRepoUrl: dto.repoUrl,
    };
  }
}
