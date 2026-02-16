import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';
import { GitHubService } from './github.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { Project } from '../../../database/entities/project.entity';
import {
  CreatePullRequestDto,
  UpdatePullRequestDto,
  MergePullRequestDto,
  PullRequestListQueryDto,
  PullRequestResponseDto,
  PullRequestListResponseDto,
  MergePullRequestResponseDto,
} from './dto/pull-request.dto';

/**
 * GitHubPullRequestController
 * Story 6.4: GitHub Pull Request Creation
 *
 * Handles GitHub pull request CRUD and merge operations for project-linked repositories.
 * Separated from GitHubRepoController and GitHubBranchController to keep PR logic isolated.
 */
@ApiTags('GitHub Pull Requests')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/projects/:projectId/github/pulls')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class GitHubPullRequestController {
  private readonly logger = new Logger(GitHubPullRequestController.name);

  constructor(
    private readonly gitHubService: GitHubService,
    private readonly integrationConnectionService: IntegrationConnectionService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Shared helper to load project, parse owner/repo, and get GitHub token.
   * DRY across all pull request endpoints.
   */
  private async getRepoContext(
    workspaceId: string,
    projectId: string,
  ): Promise<{ token: string; owner: string; repo: string; project: Project }> {
    // Load project by id and workspaceId
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this workspace');
    }

    if (!project.githubRepoUrl) {
      throw new BadRequestException(
        'Project has no linked GitHub repository',
      );
    }

    // Parse owner and repo from githubRepoUrl (handles https/http, www prefix, .git suffix)
    const urlParts = project.githubRepoUrl
      .replace(/^https?:\/\/(www\.)?github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/\/+$/, '')
      .split('/')
      .filter((part) => part.length > 0);
    const owner = urlParts[0];
    const repo = urlParts[1];

    if (!owner || !repo) {
      throw new BadRequestException(
        'Invalid GitHub repository URL: could not parse owner and repo name',
      );
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

    return { token, owner, repo, project };
  }

  /**
   * Create a pull request
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/github/pulls
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param dto - Pull request creation options
   * @param req - Request with authenticated user
   * @returns PullRequestResponseDto
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPullRequest(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreatePullRequestDto,
    @Req() req: any,
  ): Promise<PullRequestResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Creating PR "${dto.title}" for project ${projectId.substring(0, 8)}...`,
    );

    const { token, owner, repo } = await this.getRepoContext(
      workspaceId,
      projectId,
    );

    const result = await this.gitHubService.createPullRequest(
      token,
      owner,
      repo,
      {
        title: dto.title,
        head: dto.head,
        base: dto.base || 'main',
        body: dto.body,
        draft: dto.draft || false,
      },
    );

    // Add labels if provided (non-blocking: label failure should not fail PR creation)
    // Note: addLabelsToIssue catches errors internally, but we keep the try/catch
    // for defense-in-depth and to avoid setting result.labels on unexpected failures.
    if (dto.labels && dto.labels.length > 0) {
      try {
        await this.gitHubService.addLabelsToIssue(
          token,
          owner,
          repo,
          result.number,
          dto.labels,
        );
        result.labels = dto.labels;
      } catch (labelError) {
        this.logger.warn(
          `Failed to add labels to PR #${result.number}: ${(labelError as Error).message}`,
        );
      }
    }

    // Log audit event (non-blocking: audit failure should not break the endpoint)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.CREATE,
        'integration',
        String(result.number),
        {
          action: 'integration.github.pr_created',
          title: dto.title,
          head: dto.head,
          base: dto.base || 'main',
          prNumber: result.number,
          prUrl: result.htmlUrl,
          owner,
          repo,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for PR creation: ${(auditError as Error).message}`,
      );
    }

    // Create notification (non-blocking)
    try {
      await this.notificationService.create({
        workspaceId,
        type: 'pr_created',
        title: `Pull Request Created: ${dto.title}`,
        message: `PR #${result.number} created from ${dto.head} to ${dto.base || 'main'} in ${owner}/${repo}`,
        metadata: {
          prNumber: result.number,
          prUrl: result.htmlUrl,
          head: dto.head,
          base: dto.base || 'main',
        },
      });
    } catch (notifError) {
      this.logger.error(
        `Failed to create notification for PR creation: ${(notifError as Error).message}`,
      );
    }

    return result;
  }

  /**
   * List pull requests
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/github/pulls
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param query - Filtering and pagination options
   * @returns PullRequestListResponseDto
   */
  @Get()
  async listPullRequests(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: PullRequestListQueryDto,
  ): Promise<PullRequestListResponseDto> {
    this.logger.log(
      `Listing PRs for project ${projectId.substring(0, 8)}...`,
    );

    const { token, owner, repo } = await this.getRepoContext(
      workspaceId,
      projectId,
    );

    return this.gitHubService.listPullRequests(token, owner, repo, {
      state: query.state,
      sort: query.sort,
      direction: query.direction,
      page: query.page,
      perPage: query.perPage,
    });
  }

  /**
   * Get pull request details
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/github/pulls/:pullNumber
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param pullNumber - PR number
   * @returns PullRequestResponseDto
   */
  @Get(':pullNumber')
  async getPullRequest(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pullNumber', ParseIntPipe) pullNumber: number,
  ): Promise<PullRequestResponseDto> {
    this.logger.log(
      `Getting PR #${pullNumber} for project ${projectId.substring(0, 8)}...`,
    );

    const { token, owner, repo } = await this.getRepoContext(
      workspaceId,
      projectId,
    );

    const result = await this.gitHubService.getPullRequest(
      token,
      owner,
      repo,
      pullNumber,
    );

    if (!result) {
      throw new NotFoundException('Pull request not found');
    }

    return result;
  }

  /**
   * Update pull request
   * PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/github/pulls/:pullNumber
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param pullNumber - PR number
   * @param dto - Fields to update
   * @returns Updated PullRequestResponseDto
   */
  @Patch(':pullNumber')
  async updatePullRequest(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pullNumber', ParseIntPipe) pullNumber: number,
    @Body() dto: UpdatePullRequestDto,
    @Req() req: any,
  ): Promise<PullRequestResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Updating PR #${pullNumber} for project ${projectId.substring(0, 8)}...`,
    );

    const { token, owner, repo } = await this.getRepoContext(
      workspaceId,
      projectId,
    );

    // Only pass defined fields to avoid sending undefined values to Octokit
    const updateOptions: { title?: string; body?: string; state?: string; base?: string } = {};
    if (dto.title !== undefined) updateOptions.title = dto.title;
    if (dto.body !== undefined) updateOptions.body = dto.body;
    if (dto.state !== undefined) updateOptions.state = dto.state;
    if (dto.base !== undefined) updateOptions.base = dto.base;

    const result = await this.gitHubService.updatePullRequest(token, owner, repo, pullNumber, updateOptions);

    // Log audit event (non-blocking)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.UPDATE,
        'integration',
        String(pullNumber),
        {
          action: 'integration.github.pr_updated',
          pullNumber,
          updatedFields: Object.keys(updateOptions),
          owner,
          repo,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for PR update: ${(auditError as Error).message}`,
      );
    }

    return result;
  }

  /**
   * Merge pull request
   * PUT /api/v1/workspaces/:workspaceId/projects/:projectId/github/pulls/:pullNumber/merge
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param pullNumber - PR number
   * @param dto - Merge options
   * @param req - Request with authenticated user
   * @returns MergePullRequestResponseDto
   */
  @Put(':pullNumber/merge')
  async mergePullRequest(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pullNumber', ParseIntPipe) pullNumber: number,
    @Body() dto: MergePullRequestDto,
    @Req() req: any,
  ): Promise<MergePullRequestResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Merging PR #${pullNumber} for project ${projectId.substring(0, 8)}...`,
    );

    const { token, owner, repo } = await this.getRepoContext(
      workspaceId,
      projectId,
    );

    const result = await this.gitHubService.mergePullRequest(
      token,
      owner,
      repo,
      pullNumber,
      {
        mergeMethod: dto.mergeMethod || 'squash',
        commitTitle: dto.commitTitle,
        commitMessage: dto.commitMessage,
      },
    );

    // Log audit event (non-blocking)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.UPDATE,
        'integration',
        String(pullNumber),
        {
          action: 'integration.github.pr_merged',
          pullNumber,
          mergeMethod: dto.mergeMethod || 'squash',
          sha: result.sha,
          owner,
          repo,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for PR merge: ${(auditError as Error).message}`,
      );
    }

    // Create notification (non-blocking)
    try {
      await this.notificationService.create({
        workspaceId,
        type: 'pr_merged',
        title: `Pull Request Merged: #${pullNumber}`,
        message: `PR #${pullNumber} merged via ${dto.mergeMethod || 'squash'} in ${owner}/${repo}`,
        metadata: {
          pullNumber,
          mergeMethod: dto.mergeMethod || 'squash',
          sha: result.sha,
        },
      });
    } catch (notifError) {
      this.logger.error(
        `Failed to create notification for PR merge: ${(notifError as Error).message}`,
      );
    }

    return result;
  }
}
