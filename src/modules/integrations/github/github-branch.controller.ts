import {
  Controller,
  Post,
  Get,
  Delete,
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
import {
  CreateBranchDto,
  DeleteBranchDto,
  BranchResponseDto,
  BranchDetailResponseDto,
  BranchListResponseDto,
  BranchListQueryDto,
  DeleteBranchResponseDto,
} from './dto/branch.dto';

/**
 * GitHubBranchController
 * Story 6.3: GitHub Branch Management
 *
 * Handles GitHub branch CRUD operations for project-linked repositories.
 * Separated from GitHubRepoController to keep branch logic isolated.
 */
@ApiTags('GitHub Branches')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/projects/:projectId/github/branches')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class GitHubBranchController {
  private readonly logger = new Logger(GitHubBranchController.name);

  constructor(
    private readonly gitHubService: GitHubService,
    private readonly integrationConnectionService: IntegrationConnectionService,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Shared helper to load project, parse owner/repo, and get GitHub token.
   * DRY across all branch endpoints.
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
   * Create a branch
   * POST /api/v1/workspaces/:workspaceId/projects/:projectId/github/branches
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param dto - Branch creation options
   * @param req - Request with authenticated user
   * @returns BranchResponseDto
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createBranch(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateBranchDto,
    @Req() req: any,
  ): Promise<BranchResponseDto> {
    const userId = req.user.userId;

    this.logger.log(
      `Creating branch "${dto.branchName}" for project ${projectId.substring(0, 8)}...`,
    );

    const { token, owner, repo } = await this.getRepoContext(
      workspaceId,
      projectId,
    );

    const result = await this.gitHubService.createBranch(
      token,
      owner,
      repo,
      dto.branchName,
      dto.fromBranch || 'main',
    );

    // Log audit event (non-blocking: audit failure should not break the endpoint)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.CREATE,
        'integration',
        dto.branchName,
        {
          action: 'integration.github.branch_created',
          branchName: dto.branchName,
          fromBranch: dto.fromBranch || 'main',
          owner,
          repo,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for branch creation: ${(auditError as Error).message}`,
      );
    }

    return result;
  }

  /**
   * List branches
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/github/branches
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param query - Pagination and filter options
   * @returns BranchListResponseDto
   */
  @Get()
  async listBranches(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: BranchListQueryDto,
  ): Promise<BranchListResponseDto> {
    this.logger.log(
      `Listing branches for project ${projectId.substring(0, 8)}...`,
    );

    const { token, owner, repo } = await this.getRepoContext(
      workspaceId,
      projectId,
    );

    return this.gitHubService.listBranches(token, owner, repo, {
      page: query.page,
      perPage: query.perPage,
      protected: query.protected,
    });
  }

  /**
   * Get branch details
   * GET /api/v1/workspaces/:workspaceId/projects/:projectId/github/branches/info?branchName=...
   *
   * Note: Branch names contain slashes (e.g., feature/1-2), so we use a query parameter.
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param branchName - Branch name (query parameter)
   * @returns BranchDetailResponseDto
   */
  @Get('info')
  async getBranch(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('branchName') branchName: string,
  ): Promise<BranchDetailResponseDto> {
    if (!branchName) {
      throw new BadRequestException('branchName query parameter is required');
    }

    this.logger.log(
      `Getting branch "${branchName}" details for project ${projectId.substring(0, 8)}...`,
    );

    const { token, owner, repo } = await this.getRepoContext(
      workspaceId,
      projectId,
    );

    const result = await this.gitHubService.getBranch(
      token,
      owner,
      repo,
      branchName,
    );

    if (!result) {
      throw new NotFoundException('Branch not found');
    }

    return result;
  }

  /**
   * Delete a branch
   * DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/github/branches
   *
   * @param workspaceId - Workspace ID from URL
   * @param projectId - Project ID from URL
   * @param dto - Branch deletion options
   * @param req - Request with authenticated user
   * @returns DeleteBranchResponseDto
   */
  @Delete()
  async deleteBranch(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: DeleteBranchDto,
    @Req() req: any,
  ): Promise<DeleteBranchResponseDto> {
    const userId = req.user.userId;

    // Protect default branches (main, master, develop)
    const protectedBranches = ['main', 'master', 'develop'];
    if (protectedBranches.includes(dto.branchName)) {
      throw new BadRequestException(
        `Cannot delete protected branch: ${dto.branchName}`,
      );
    }

    this.logger.log(
      `Deleting branch "${dto.branchName}" for project ${projectId.substring(0, 8)}...`,
    );

    const { token, owner, repo } = await this.getRepoContext(
      workspaceId,
      projectId,
    );

    await this.gitHubService.deleteBranch(
      token,
      owner,
      repo,
      dto.branchName,
    );

    // Log audit event (non-blocking: audit failure should not break the endpoint)
    try {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.DELETE,
        'integration',
        dto.branchName,
        {
          action: 'integration.github.branch_deleted',
          branchName: dto.branchName,
          owner,
          repo,
        },
      );
    } catch (auditError) {
      this.logger.error(
        `Failed to log audit event for branch deletion: ${(auditError as Error).message}`,
      );
    }

    return {
      success: true,
      deletedBranch: dto.branchName,
    };
  }
}
