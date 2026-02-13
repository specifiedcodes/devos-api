import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  BadGatewayException,
  HttpException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GitHubPullRequestController } from './github-pr.controller';
import { GitHubService } from './github.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { Project } from '../../../database/entities/project.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AuditService } from '../../../shared/audit/audit.service';
import { NotificationService } from '../../notification/notification.service';

// Mock Octokit to prevent ESM import issues
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

/**
 * GitHubPullRequestController Unit Tests
 * Story 6.4: GitHub Pull Request Creation
 */
describe('GitHubPullRequestController', () => {
  let controller: GitHubPullRequestController;
  let mockGitHubService: any;
  let mockIntegrationService: any;
  let mockProjectRepository: any;
  let mockAuditService: any;
  let mockNotificationService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockReq = { user: { userId: mockUserId } };

  const mockProject = {
    id: mockProjectId,
    name: 'My Project',
    workspaceId: mockWorkspaceId,
    githubRepoUrl: 'https://github.com/testuser/my-repo',
  };

  const mockPrResponse = {
    id: 1,
    number: 42,
    title: 'Story 1.2: User Login',
    body: '## Story\nUser Login',
    state: 'open',
    htmlUrl: 'https://github.com/testuser/my-repo/pull/42',
    head: { ref: 'feature/1-2-user-login', sha: 'abc123' },
    base: { ref: 'main', sha: 'def456' },
    draft: false,
    labels: [],
    user: { login: 'testuser', avatarUrl: 'https://avatars.githubusercontent.com/u/12345' },
    createdAt: '2026-01-31T10:00:00Z',
    updatedAt: '2026-01-31T10:00:00Z',
  };

  beforeEach(async () => {
    mockGitHubService = {
      createPullRequest: jest.fn(),
      listPullRequests: jest.fn(),
      getPullRequest: jest.fn(),
      updatePullRequest: jest.fn(),
      mergePullRequest: jest.fn(),
      addLabelsToIssue: jest.fn(),
    };

    mockIntegrationService = {
      getDecryptedToken: jest.fn().mockResolvedValue('gho_test_token_abc123'),
    };

    mockProjectRepository = {
      findOne: jest.fn().mockResolvedValue(mockProject),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GitHubPullRequestController],
      providers: [
        { provide: GitHubService, useValue: mockGitHubService },
        {
          provide: IntegrationConnectionService,
          useValue: mockIntegrationService,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<GitHubPullRequestController>(
      GitHubPullRequestController,
    );
    jest.clearAllMocks();

    // Re-apply default mocks after clearAllMocks
    mockIntegrationService.getDecryptedToken.mockResolvedValue(
      'gho_test_token_abc123',
    );
    mockAuditService.log.mockResolvedValue(undefined);
    mockNotificationService.create.mockResolvedValue({ id: 'notif-1' });
    mockProjectRepository.findOne.mockResolvedValue(mockProject);
  });

  // ============ POST / (createPullRequest) ============

  describe('POST / (createPullRequest)', () => {
    it('should return 201 with PR details for valid request', async () => {
      mockGitHubService.createPullRequest.mockResolvedValue(mockPrResponse);

      const result = await controller.createPullRequest(
        mockWorkspaceId,
        mockProjectId,
        {
          title: 'Story 1.2: User Login',
          head: 'feature/1-2-user-login',
        },
        mockReq,
      );

      expect(result).toEqual(mockPrResponse);
      expect(mockGitHubService.createPullRequest).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        expect.objectContaining({
          title: 'Story 1.2: User Login',
          head: 'feature/1-2-user-login',
          base: 'main',
          draft: false,
        }),
      );
    });

    it('should use default base="main" when not specified', async () => {
      mockGitHubService.createPullRequest.mockResolvedValue(mockPrResponse);

      await controller.createPullRequest(
        mockWorkspaceId,
        mockProjectId,
        {
          title: 'Test PR',
          head: 'feature/test',
        },
        mockReq,
      );

      expect(mockGitHubService.createPullRequest).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        expect.objectContaining({
          base: 'main',
        }),
      );
    });

    it('should add labels when provided in request', async () => {
      mockGitHubService.createPullRequest.mockResolvedValue(mockPrResponse);
      mockGitHubService.addLabelsToIssue.mockResolvedValue(undefined);

      const result = await controller.createPullRequest(
        mockWorkspaceId,
        mockProjectId,
        {
          title: 'Test PR',
          head: 'feature/test',
          labels: ['ai-generated', 'feat'],
        },
        mockReq,
      );

      expect(mockGitHubService.addLabelsToIssue).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        42,
        ['ai-generated', 'feat'],
      );
      expect(result.labels).toEqual(['ai-generated', 'feat']);
    });

    it('should not fail if addLabelsToIssue fails', async () => {
      mockGitHubService.createPullRequest.mockResolvedValue(mockPrResponse);
      mockGitHubService.addLabelsToIssue.mockRejectedValue(
        new Error('Label error'),
      );

      const result = await controller.createPullRequest(
        mockWorkspaceId,
        mockProjectId,
        {
          title: 'Test PR',
          head: 'feature/test',
          labels: ['ai-generated'],
        },
        mockReq,
      );

      // Should still return PR response (labels stay as empty from PR creation)
      expect(result).toEqual(mockPrResponse);
    });

    it('should return 400 when project has no GitHub repo', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        githubRepoUrl: null,
      });

      await expect(
        controller.createPullRequest(
          mockWorkspaceId,
          mockProjectId,
          {
            title: 'Test PR',
            head: 'feature/test',
          },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 403 when GitHub integration not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active github integration found'),
      );

      await expect(
        controller.createPullRequest(
          mockWorkspaceId,
          mockProjectId,
          {
            title: 'Test PR',
            head: 'feature/test',
          },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return 404 when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.createPullRequest(
          mockWorkspaceId,
          mockProjectId,
          {
            title: 'Test PR',
            head: 'feature/test',
          },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 422 when PR already exists (propagate ConflictException)', async () => {
      mockGitHubService.createPullRequest.mockRejectedValue(
        new ConflictException('Pull request already exists'),
      );

      await expect(
        controller.createPullRequest(
          mockWorkspaceId,
          mockProjectId,
          {
            title: 'Test PR',
            head: 'feature/test',
          },
          mockReq,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should return 502 when GitHub API fails (propagate BadGatewayException)', async () => {
      mockGitHubService.createPullRequest.mockRejectedValue(
        new BadGatewayException('GitHub API error'),
      );

      await expect(
        controller.createPullRequest(
          mockWorkspaceId,
          mockProjectId,
          {
            title: 'Test PR',
            head: 'feature/test',
          },
          mockReq,
        ),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should log audit event after creation', async () => {
      mockGitHubService.createPullRequest.mockResolvedValue(mockPrResponse);

      await controller.createPullRequest(
        mockWorkspaceId,
        mockProjectId,
        {
          title: 'Story 1.2: User Login',
          head: 'feature/1-2-user-login',
        },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        '42',
        expect.objectContaining({
          action: 'integration.github.pr_created',
          title: 'Story 1.2: User Login',
          head: 'feature/1-2-user-login',
          prNumber: 42,
        }),
      );
    });

    it('should create notification after creation', async () => {
      mockGitHubService.createPullRequest.mockResolvedValue(mockPrResponse);

      await controller.createPullRequest(
        mockWorkspaceId,
        mockProjectId,
        {
          title: 'Story 1.2: User Login',
          head: 'feature/1-2-user-login',
        },
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          type: 'pr_created',
          title: expect.stringContaining('Pull Request Created'),
          message: expect.stringContaining('PR #42'),
        }),
      );
    });
  });

  // ============ GET / (listPullRequests) ============

  describe('GET / (listPullRequests)', () => {
    const prListResponse = {
      pullRequests: [mockPrResponse],
      total: 1,
    };

    it('should return 200 with PR list', async () => {
      mockGitHubService.listPullRequests.mockResolvedValue(prListResponse);

      const result = await controller.listPullRequests(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result).toEqual(prListResponse);
    });

    it('should pass state, sort, direction, pagination params to service', async () => {
      mockGitHubService.listPullRequests.mockResolvedValue(prListResponse);

      await controller.listPullRequests(mockWorkspaceId, mockProjectId, {
        state: 'closed',
        sort: 'updated',
        direction: 'asc',
        page: 2,
        perPage: 50,
      });

      expect(mockGitHubService.listPullRequests).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        {
          state: 'closed',
          sort: 'updated',
          direction: 'asc',
          page: 2,
          perPage: 50,
        },
      );
    });

    it('should return 400 when project has no GitHub repo', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        githubRepoUrl: null,
      });

      await expect(
        controller.listPullRequests(mockWorkspaceId, mockProjectId, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 403 when GitHub not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active github integration found'),
      );

      await expect(
        controller.listPullRequests(mockWorkspaceId, mockProjectId, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============ GET /:pullNumber (getPullRequest) ============

  describe('GET /:pullNumber (getPullRequest)', () => {
    it('should return 200 with PR details', async () => {
      mockGitHubService.getPullRequest.mockResolvedValue(mockPrResponse);

      const result = await controller.getPullRequest(
        mockWorkspaceId,
        mockProjectId,
        42,
      );

      expect(result).toEqual(mockPrResponse);
      expect(mockGitHubService.getPullRequest).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        42,
      );
    });

    it('should return 404 when PR not found', async () => {
      mockGitHubService.getPullRequest.mockResolvedValue(null);

      await expect(
        controller.getPullRequest(mockWorkspaceId, mockProjectId, 999),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 400 when project has no GitHub repo', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        githubRepoUrl: null,
      });

      await expect(
        controller.getPullRequest(mockWorkspaceId, mockProjectId, 42),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============ PATCH /:pullNumber (updatePullRequest) ============

  describe('PATCH /:pullNumber (updatePullRequest)', () => {
    it('should return 200 with updated PR details', async () => {
      const updatedPr = { ...mockPrResponse, title: 'Updated title' };
      mockGitHubService.updatePullRequest.mockResolvedValue(updatedPr);

      const result = await controller.updatePullRequest(
        mockWorkspaceId,
        mockProjectId,
        42,
        { title: 'Updated title' },
        mockReq,
      );

      expect(result).toEqual(updatedPr);
      expect(mockGitHubService.updatePullRequest).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        42,
        expect.objectContaining({ title: 'Updated title' }),
      );
    });

    it('should return 404 when PR not found', async () => {
      mockGitHubService.updatePullRequest.mockRejectedValue(
        new NotFoundException('Pull request not found'),
      );

      await expect(
        controller.updatePullRequest(mockWorkspaceId, mockProjectId, 999, {
          title: 'Test',
        }, mockReq),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log audit event after update', async () => {
      mockGitHubService.updatePullRequest.mockResolvedValue(mockPrResponse);

      await controller.updatePullRequest(
        mockWorkspaceId,
        mockProjectId,
        42,
        { title: 'Updated title', state: 'closed' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        '42',
        expect.objectContaining({
          action: 'integration.github.pr_updated',
          pullNumber: 42,
          updatedFields: expect.arrayContaining(['title', 'state']),
        }),
      );
    });

    it('should only pass defined fields to service', async () => {
      mockGitHubService.updatePullRequest.mockResolvedValue(mockPrResponse);

      await controller.updatePullRequest(
        mockWorkspaceId,
        mockProjectId,
        42,
        { title: 'Updated title' },
        mockReq,
      );

      // Should not include undefined fields like body, state, base
      const callArgs = mockGitHubService.updatePullRequest.mock.calls[0][4];
      expect(callArgs).toEqual({ title: 'Updated title' });
      expect(callArgs).not.toHaveProperty('body');
      expect(callArgs).not.toHaveProperty('state');
      expect(callArgs).not.toHaveProperty('base');
    });
  });

  // ============ PUT /:pullNumber/merge (mergePullRequest) ============

  describe('PUT /:pullNumber/merge (mergePullRequest)', () => {
    const mergeResult = {
      merged: true,
      sha: 'abc123def456',
      message: 'Pull Request successfully merged',
    };

    it('should return 200 with merge result (merged=true)', async () => {
      mockGitHubService.mergePullRequest.mockResolvedValue(mergeResult);

      const result = await controller.mergePullRequest(
        mockWorkspaceId,
        mockProjectId,
        42,
        {},
        mockReq,
      );

      expect(result).toEqual(mergeResult);
    });

    it('should use default mergeMethod="squash" when not specified', async () => {
      mockGitHubService.mergePullRequest.mockResolvedValue(mergeResult);

      await controller.mergePullRequest(
        mockWorkspaceId,
        mockProjectId,
        42,
        {},
        mockReq,
      );

      expect(mockGitHubService.mergePullRequest).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        42,
        expect.objectContaining({
          mergeMethod: 'squash',
        }),
      );
    });

    it('should return 405 when PR not mergeable', async () => {
      mockGitHubService.mergePullRequest.mockRejectedValue(
        new HttpException('Pull request is not mergeable', 405),
      );

      await expect(
        controller.mergePullRequest(
          mockWorkspaceId,
          mockProjectId,
          42,
          {},
          mockReq,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should return 404 when PR not found', async () => {
      mockGitHubService.mergePullRequest.mockRejectedValue(
        new NotFoundException('Pull request not found'),
      );

      await expect(
        controller.mergePullRequest(
          mockWorkspaceId,
          mockProjectId,
          999,
          {},
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 409 on SHA mismatch', async () => {
      mockGitHubService.mergePullRequest.mockRejectedValue(
        new ConflictException('Head branch was modified'),
      );

      await expect(
        controller.mergePullRequest(
          mockWorkspaceId,
          mockProjectId,
          42,
          {},
          mockReq,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should log audit event after merge', async () => {
      mockGitHubService.mergePullRequest.mockResolvedValue(mergeResult);

      await controller.mergePullRequest(
        mockWorkspaceId,
        mockProjectId,
        42,
        { mergeMethod: 'squash' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        '42',
        expect.objectContaining({
          action: 'integration.github.pr_merged',
          pullNumber: 42,
          mergeMethod: 'squash',
          sha: 'abc123def456',
        }),
      );
    });

    it('should create notification after merge', async () => {
      mockGitHubService.mergePullRequest.mockResolvedValue(mergeResult);

      await controller.mergePullRequest(
        mockWorkspaceId,
        mockProjectId,
        42,
        {},
        mockReq,
      );

      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: mockWorkspaceId,
          type: 'pr_merged',
          title: expect.stringContaining('Pull Request Merged: #42'),
          message: expect.stringContaining('PR #42 merged'),
        }),
      );
    });
  });

  // ============ All endpoints: getRepoContext ============

  describe('getRepoContext (shared validation)', () => {
    it('should call getRepoContext to validate project and get token for all endpoints', async () => {
      // Test that all endpoints use the shared helper
      mockGitHubService.createPullRequest.mockResolvedValue(mockPrResponse);
      mockGitHubService.listPullRequests.mockResolvedValue({
        pullRequests: [],
        total: 0,
      });
      mockGitHubService.getPullRequest.mockResolvedValue(mockPrResponse);
      mockGitHubService.updatePullRequest.mockResolvedValue(mockPrResponse);
      mockGitHubService.mergePullRequest.mockResolvedValue({
        merged: true,
        sha: 'abc',
        message: 'ok',
      });

      // All endpoints should load project and get token
      await controller.createPullRequest(
        mockWorkspaceId,
        mockProjectId,
        { title: 'Test', head: 'feature/test' },
        mockReq,
      );
      await controller.listPullRequests(mockWorkspaceId, mockProjectId, {});
      await controller.getPullRequest(mockWorkspaceId, mockProjectId, 42);
      await controller.updatePullRequest(mockWorkspaceId, mockProjectId, 42, {
        title: 'Test',
      }, mockReq);
      await controller.mergePullRequest(
        mockWorkspaceId,
        mockProjectId,
        42,
        {},
        mockReq,
      );

      // Each call should have triggered project lookup and token retrieval
      expect(mockProjectRepository.findOne).toHaveBeenCalledTimes(5);
      expect(mockIntegrationService.getDecryptedToken).toHaveBeenCalledTimes(5);
    });
  });
});
