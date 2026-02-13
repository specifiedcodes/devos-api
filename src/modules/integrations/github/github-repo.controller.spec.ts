import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadGatewayException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GitHubRepoController } from './github-repo.controller';
import { GitHubService } from './github.service';
import { IntegrationConnectionService } from '../integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';
import { Project } from '../../../database/entities/project.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AuditService } from '../../../shared/audit/audit.service';

// Mock Octokit to prevent ESM import issues
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      createForAuthenticatedUser: jest.fn(),
      get: jest.fn(),
    },
  })),
}));

/**
 * GitHubRepoController Unit Tests
 * Story 6.2: GitHub Repository Creation
 */
describe('GitHubRepoController', () => {
  let controller: GitHubRepoController;
  let mockGitHubService: any;
  let mockIntegrationService: any;
  let mockProjectRepository: any;
  let mockAuditService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockProjectId = '33333333-3333-3333-3333-333333333333';
  const mockReq = { user: { userId: mockUserId } };

  const mockRepoResponse = {
    id: 123456789,
    name: 'my-repo',
    fullName: 'testuser/my-repo',
    htmlUrl: 'https://github.com/testuser/my-repo',
    cloneUrl: 'https://github.com/testuser/my-repo.git',
    sshUrl: 'git@github.com:testuser/my-repo.git',
    private: true,
    defaultBranch: 'main',
    description: 'Test repository',
  };

  beforeEach(async () => {
    mockGitHubService = {
      createRepository: jest.fn(),
      getRepository: jest.fn(),
    };

    mockIntegrationService = {
      getDecryptedToken: jest.fn().mockResolvedValue('gho_test_token_abc123'),
    };

    mockProjectRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GitHubRepoController],
      providers: [
        { provide: GitHubService, useValue: mockGitHubService },
        { provide: IntegrationConnectionService, useValue: mockIntegrationService },
        { provide: getRepositoryToken(Project), useValue: mockProjectRepository },
        { provide: AuditService, useValue: mockAuditService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<GitHubRepoController>(GitHubRepoController);
    jest.clearAllMocks();

    // Re-apply default mocks after clearAllMocks
    mockIntegrationService.getDecryptedToken.mockResolvedValue('gho_test_token_abc123');
    mockAuditService.log.mockResolvedValue(undefined);
    mockProjectRepository.update.mockResolvedValue({ affected: 1 });
  });

  describe('POST /repos (createRepository)', () => {
    it('should return 201 with repository details for valid request', async () => {
      mockGitHubService.createRepository.mockResolvedValue(mockRepoResponse);

      const result = await controller.createRepository(
        mockWorkspaceId,
        { name: 'my-repo', description: 'Test repository' },
        mockReq,
      );

      expect(mockIntegrationService.getDecryptedToken).toHaveBeenCalledWith(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );
      expect(mockGitHubService.createRepository).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        'my-repo',
        {
          description: 'Test repository',
          private: undefined,
          autoInit: undefined,
          gitignoreTemplate: undefined,
          licenseTemplate: undefined,
        },
      );
      expect(result).toEqual(mockRepoResponse);
    });

    it('should throw ForbiddenException when GitHub integration not connected', async () => {
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active github integration found'),
      );

      await expect(
        controller.createRepository(
          mockWorkspaceId,
          { name: 'my-repo' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate ConflictException when repo already exists', async () => {
      mockGitHubService.createRepository.mockRejectedValue(
        new ConflictException('Repository with this name already exists on GitHub'),
      );

      await expect(
        controller.createRepository(
          mockWorkspaceId,
          { name: 'existing-repo' },
          mockReq,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should propagate BadGatewayException when GitHub API fails', async () => {
      mockGitHubService.createRepository.mockRejectedValue(
        new BadGatewayException('GitHub API error'),
      );

      await expect(
        controller.createRepository(
          mockWorkspaceId,
          { name: 'my-repo' },
          mockReq,
        ),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should use workspace decrypted GitHub token', async () => {
      mockGitHubService.createRepository.mockResolvedValue(mockRepoResponse);

      await controller.createRepository(
        mockWorkspaceId,
        { name: 'my-repo' },
        mockReq,
      );

      expect(mockIntegrationService.getDecryptedToken).toHaveBeenCalledWith(
        mockWorkspaceId,
        IntegrationProvider.GITHUB,
      );

      expect(mockGitHubService.createRepository).toHaveBeenCalledWith(
        'gho_test_token_abc123',
        expect.any(String),
        expect.any(Object),
      );
    });

    it('should log audit event after creation', async () => {
      mockGitHubService.createRepository.mockResolvedValue(mockRepoResponse);

      await controller.createRepository(
        mockWorkspaceId,
        { name: 'my-repo' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        expect.any(String),
        expect.objectContaining({
          action: 'integration.github.repo_created',
        }),
      );
    });
  });

  describe('PUT /projects/:projectId/github-repo (linkRepository)', () => {
    it('should update project with valid GitHub URL', async () => {
      mockGitHubService.getRepository.mockResolvedValue(mockRepoResponse);
      mockProjectRepository.findOne.mockResolvedValue({
        id: mockProjectId,
        name: 'My Project',
        workspaceId: mockWorkspaceId,
      });

      const result = await controller.linkRepository(
        mockWorkspaceId,
        mockProjectId,
        { repoUrl: 'https://github.com/testuser/my-repo' },
        mockReq,
      );

      expect(result).toEqual({
        success: true,
        githubRepoUrl: 'https://github.com/testuser/my-repo',
      });
      expect(mockProjectRepository.update).toHaveBeenCalledWith(
        mockProjectId,
        { githubRepoUrl: 'https://github.com/testuser/my-repo' },
      );
    });

    it('should throw NotFoundException when repo not found on GitHub', async () => {
      mockGitHubService.getRepository.mockResolvedValue(null);
      mockProjectRepository.findOne.mockResolvedValue({
        id: mockProjectId,
        name: 'My Project',
        workspaceId: mockWorkspaceId,
      });

      await expect(
        controller.linkRepository(
          mockWorkspaceId,
          mockProjectId,
          { repoUrl: 'https://github.com/testuser/nonexistent' },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when GitHub integration not connected', async () => {
      mockProjectRepository.findOne.mockResolvedValue({
        id: mockProjectId,
        name: 'My Project',
        workspaceId: mockWorkspaceId,
      });
      mockIntegrationService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active github integration found'),
      );

      await expect(
        controller.linkRepository(
          mockWorkspaceId,
          mockProjectId,
          { repoUrl: 'https://github.com/testuser/my-repo' },
          mockReq,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when project not found', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.linkRepository(
          mockWorkspaceId,
          mockProjectId,
          { repoUrl: 'https://github.com/testuser/my-repo' },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log audit event after linking', async () => {
      mockGitHubService.getRepository.mockResolvedValue(mockRepoResponse);
      mockProjectRepository.findOne.mockResolvedValue({
        id: mockProjectId,
        name: 'My Project',
        workspaceId: mockWorkspaceId,
      });

      await controller.linkRepository(
        mockWorkspaceId,
        mockProjectId,
        { repoUrl: 'https://github.com/testuser/my-repo' },
        mockReq,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        expect.any(String),
        'integration',
        mockProjectId,
        expect.objectContaining({
          action: 'integration.github.repo_linked',
        }),
      );
    });
  });
});
