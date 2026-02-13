import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  BadGatewayException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GitHubBranchController } from './github-branch.controller';
import { GitHubService } from './github.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { Project } from '../../../database/entities/project.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AuditService } from '../../../shared/audit/audit.service';

// Mock Octokit to prevent ESM import issues
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

/**
 * GitHubBranchController Unit Tests
 * Story 6.3: GitHub Branch Management
 */
describe('GitHubBranchController', () => {
  let controller: GitHubBranchController;
  let mockGitHubService: any;
  let mockIntegrationService: any;
  let mockProjectRepository: any;
  let mockAuditService: any;

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

  beforeEach(async () => {
    mockGitHubService = {
      createBranch: jest.fn(),
      listBranches: jest.fn(),
      getBranch: jest.fn(),
      deleteBranch: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GitHubBranchController],
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
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<GitHubBranchController>(GitHubBranchController);
    jest.clearAllMocks();

    // Re-apply default mocks after clearAllMocks
    mockIntegrationService.getDecryptedToken.mockResolvedValue(
      'gho_test_token_abc123',
    );
    mockAuditService.log.mockResolvedValue(undefined);
    mockProjectRepository.findOne.mockResolvedValue(mockProject);
  });

  // ============ POST / (createBranch) ============

  describe('POST / (createBranch)', () => {
    const branchResponse = {
      branchName: 'feature/1-2-user-login',
      sha: 'abc123',
      ref: 'refs/heads/feature/1-2-user-login',
      url: 'https://api.github.com/repos/testuser/my-repo/git/refs/heads/feature/1-2-user-login',
    };

    it('should return 201 with branch details for valid request', async () => {
      mockGitHubService.createBranch.mockResolvedValue(branchResponse);

      const result = await controller.createBranch(
        mockWorkspaceId,
        mockProjectId,
        { branchName: 'feature/1-2-user-login' },
        mockReq,
      );

      expect(result).toEqual(branchResponse);
      expect(mockGitHubService.createBranch).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        'feature/1-2-user-login',
        'main',
      );
    });

    it('should use default fromBranch="main" when not specified', async () => {
      mockGitHubService.createBranch.mockResolvedValue(branchResponse);

      await controller.createBranch(
        mockWorkspaceId,
        mockProjectId,
        { branchName: 'feature/test' },
        mockReq,
      );

      expect(mockGitHubService.createBranch).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        'feature/test',
        'main',
      );
    });

    it('should use specified fromBranch when provided', async () => {
      mockGitHubService.createBranch.mockResolvedValue(branchResponse);

      await controller.createBranch(
        mockWorkspaceId,
        mockProjectId,
        { branchName: 'feature/test', fromBranch: 'develop' },
        mockReq,
      );

      expect(mockGitHubService.createBranch).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        'feature/test',
        'develop',
      );
    });

    it('should return 400 when project has no GitHub repo', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        githubRepoUrl: null,
      });

      await expect(
        controller.createBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'feature/test' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 403 when GitHub integration not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active github integration found'),
      );

      await expect(
        controller.createBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'feature/test' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return 404 when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.createBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'feature/test' },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 409 when branch already exists (propagate ConflictException)', async () => {
      mockGitHubService.createBranch.mockRejectedValue(
        new ConflictException('Branch already exists'),
      );

      await expect(
        controller.createBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'existing-branch' },
          mockReq,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should return 502 when GitHub API fails (propagate BadGatewayException)', async () => {
      mockGitHubService.createBranch.mockRejectedValue(
        new BadGatewayException('GitHub API error'),
      );

      await expect(
        controller.createBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'feature/test' },
          mockReq,
        ),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should log audit event after creation', async () => {
      mockGitHubService.createBranch.mockResolvedValue(branchResponse);

      await controller.createBranch(
        mockWorkspaceId,
        mockProjectId,
        { branchName: 'feature/1-2-user-login' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'feature/1-2-user-login',
        expect.objectContaining({
          action: 'integration.github.branch_created',
          branchName: 'feature/1-2-user-login',
        }),
      );
    });
  });

  // ============ GET / (listBranches) ============

  describe('GET / (listBranches)', () => {
    const branchListResponse = {
      branches: [
        {
          name: 'main',
          sha: 'abc123',
          protected: true,
          url: 'https://api.github.com/repos/testuser/my-repo/branches/main',
        },
        {
          name: 'feature/1-2-user-login',
          sha: 'def456',
          protected: false,
          url: 'https://api.github.com/repos/testuser/my-repo/branches/feature/1-2-user-login',
        },
      ],
      total: 2,
    };

    it('should return 200 with branch list', async () => {
      mockGitHubService.listBranches.mockResolvedValue(branchListResponse);

      const result = await controller.listBranches(
        mockWorkspaceId,
        mockProjectId,
        {},
      );

      expect(result).toEqual(branchListResponse);
    });

    it('should pass pagination params to service', async () => {
      mockGitHubService.listBranches.mockResolvedValue(branchListResponse);

      await controller.listBranches(mockWorkspaceId, mockProjectId, {
        page: 2,
        perPage: 50,
      });

      expect(mockGitHubService.listBranches).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        {
          page: 2,
          perPage: 50,
          protected: undefined,
        },
      );
    });

    it('should pass protected filter to service', async () => {
      mockGitHubService.listBranches.mockResolvedValue({
        branches: [],
        total: 0,
      });

      await controller.listBranches(mockWorkspaceId, mockProjectId, {
        protected: true,
      });

      expect(mockGitHubService.listBranches).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        expect.objectContaining({
          protected: true,
        }),
      );
    });

    it('should return 400 when project has no GitHub repo', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        githubRepoUrl: null,
      });

      await expect(
        controller.listBranches(mockWorkspaceId, mockProjectId, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 403 when GitHub not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active github integration found'),
      );

      await expect(
        controller.listBranches(mockWorkspaceId, mockProjectId, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============ GET /info (getBranch) ============

  describe('GET /info (getBranch)', () => {
    const branchDetail = {
      name: 'feature/1-2-user-login',
      sha: 'def456',
      protected: false,
      url: 'https://github.com/testuser/my-repo/tree/feature/1-2-user-login',
      commit: {
        sha: 'def456',
        message: 'feat: implement user login (Story 1.2)',
        author: 'testuser',
        date: '2026-01-30T10:00:00Z',
      },
    };

    it('should return 200 with branch details', async () => {
      mockGitHubService.getBranch.mockResolvedValue(branchDetail);

      const result = await controller.getBranch(
        mockWorkspaceId,
        mockProjectId,
        'feature/1-2-user-login',
      );

      expect(result).toEqual(branchDetail);
      expect(mockGitHubService.getBranch).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        'feature/1-2-user-login',
      );
    });

    it('should return 404 when branch not found', async () => {
      mockGitHubService.getBranch.mockResolvedValue(null);

      await expect(
        controller.getBranch(
          mockWorkspaceId,
          mockProjectId,
          'nonexistent-branch',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 400 when project has no GitHub repo', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        githubRepoUrl: null,
      });

      await expect(
        controller.getBranch(
          mockWorkspaceId,
          mockProjectId,
          'feature/test',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 when branchName query param is missing', async () => {
      await expect(
        controller.getBranch(mockWorkspaceId, mockProjectId, ''),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============ DELETE / (deleteBranch) ============

  describe('DELETE / (deleteBranch)', () => {
    it('should return 200 with success for valid branch', async () => {
      mockGitHubService.deleteBranch.mockResolvedValue(undefined);

      const result = await controller.deleteBranch(
        mockWorkspaceId,
        mockProjectId,
        { branchName: 'feature/1-2-user-login' },
        mockReq,
      );

      expect(result).toEqual({
        success: true,
        deletedBranch: 'feature/1-2-user-login',
      });
      expect(mockGitHubService.deleteBranch).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'testuser',
        'my-repo',
        'feature/1-2-user-login',
      );
    });

    it('should return 400 when trying to delete main', async () => {
      await expect(
        controller.deleteBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'main' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);

      // Service should NOT have been called
      expect(mockGitHubService.deleteBranch).not.toHaveBeenCalled();
    });

    it('should return 400 when trying to delete master', async () => {
      await expect(
        controller.deleteBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'master' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockGitHubService.deleteBranch).not.toHaveBeenCalled();
    });

    it('should return 400 when trying to delete develop', async () => {
      await expect(
        controller.deleteBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'develop' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockGitHubService.deleteBranch).not.toHaveBeenCalled();
    });

    it('should return 404 when branch not found (propagate NotFoundException)', async () => {
      mockGitHubService.deleteBranch.mockRejectedValue(
        new NotFoundException('Branch not found'),
      );

      await expect(
        controller.deleteBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'nonexistent' },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return 403 when GitHub not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active github integration found'),
      );

      await expect(
        controller.deleteBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'feature/test' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should log audit event after deletion', async () => {
      mockGitHubService.deleteBranch.mockResolvedValue(undefined);

      await controller.deleteBranch(
        mockWorkspaceId,
        mockProjectId,
        { branchName: 'feature/1-2-user-login' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        'feature/1-2-user-login',
        expect.objectContaining({
          action: 'integration.github.branch_deleted',
          branchName: 'feature/1-2-user-login',
        }),
      );
    });

    it('should return 400 when project has no GitHub repo', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        githubRepoUrl: null,
      });

      await expect(
        controller.deleteBranch(
          mockWorkspaceId,
          mockProjectId,
          { branchName: 'feature/test' },
          mockReq,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
