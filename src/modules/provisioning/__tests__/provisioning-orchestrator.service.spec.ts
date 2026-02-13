import { Test, TestingModule } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProvisioningOrchestratorService } from '../services/provisioning-orchestrator.service';
import { ProvisioningStatusService } from '../services/provisioning-status.service';
import { ProvisioningStatus, ProvisioningStatusEnum } from '../../../database/entities/provisioning-status.entity';
import { Project, ProjectStatus } from '../../../database/entities/project.entity';
import { GitHubService } from '../../integrations/github/github.service';
import { IntegrationConnectionService } from '../../integrations/integration-connection.service';

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
 * ProvisioningOrchestratorService Unit Tests
 * Story 4.7: Auto-Provisioning Status Backend (original tests)
 * Story 6.2: GitHub Repository Creation (updated with real GitHub integration tests)
 */
describe('ProvisioningOrchestratorService', () => {
  let service: ProvisioningOrchestratorService;

  const mockProvisioningStatusService = {
    createProvisioningStatus: jest.fn(),
    findByProjectId: jest.fn(),
    updateStepStatus: jest.fn(),
    updateOverallStatus: jest.fn(),
  };

  const mockProjectRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockGitHubService = {
    createRepository: jest.fn(),
    getRepository: jest.fn(),
  };

  const mockIntegrationConnectionService = {
    getDecryptedToken: jest.fn(),
  };

  const projectId = '550e8400-e29b-41d4-a716-446655440001';
  const workspaceId = '550e8400-e29b-41d4-a716-446655440002';

  const mockProject = {
    id: projectId,
    name: 'Test Project',
    description: 'A test project description',
    workspaceId,
    status: ProjectStatus.ACTIVE,
  };

  const mockRepoResponse = {
    id: 123456789,
    name: 'Test-Project',
    fullName: 'testuser/Test-Project',
    htmlUrl: 'https://github.com/testuser/Test-Project',
    cloneUrl: 'https://github.com/testuser/Test-Project.git',
    sshUrl: 'git@github.com:testuser/Test-Project.git',
    private: true,
    defaultBranch: 'main',
    description: 'A test project description',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvisioningOrchestratorService,
        {
          provide: ProvisioningStatusService,
          useValue: mockProvisioningStatusService,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
        {
          provide: GitHubService,
          useValue: mockGitHubService,
        },
        {
          provide: IntegrationConnectionService,
          useValue: mockIntegrationConnectionService,
        },
      ],
    }).compile();

    service = module.get<ProvisioningOrchestratorService>(ProvisioningOrchestratorService);

    jest.clearAllMocks();

    // Setup default mocks
    mockProjectRepository.findOne.mockResolvedValue(mockProject);
    mockProjectRepository.update.mockResolvedValue({ affected: 1 });
    mockProvisioningStatusService.updateStepStatus.mockResolvedValue({});
    mockProvisioningStatusService.updateOverallStatus.mockResolvedValue({});
    mockProvisioningStatusService.createProvisioningStatus.mockResolvedValue({});
    mockIntegrationConnectionService.getDecryptedToken.mockResolvedValue('gho_test_token');
    mockGitHubService.createRepository.mockResolvedValue(mockRepoResponse);
  });

  describe('startProvisioning', () => {
    it('should execute all steps in order and mark as completed', async () => {
      await service.startProvisioning(projectId, workspaceId, {});

      // Verify provisioning status created
      expect(mockProvisioningStatusService.createProvisioningStatus).toHaveBeenCalledWith(
        projectId,
        workspaceId,
      );

      // Verify overall status set to in_progress
      expect(mockProvisioningStatusService.updateOverallStatus).toHaveBeenCalledWith(
        projectId,
        ProvisioningStatusEnum.IN_PROGRESS,
      );

      // Verify all steps were executed (github, database, deployment, init)
      // Each step gets: in_progress + completed = 2 calls
      // But github step also calls updateStepStatus internally (completed)
      // So we check that completed was eventually called
      expect(mockProvisioningStatusService.updateOverallStatus).toHaveBeenCalledWith(
        projectId,
        ProvisioningStatusEnum.COMPLETED,
      );
    }, 15000);

    it('should continue workflow when GitHub step fails (non-blocking)', async () => {
      // Story 6.2 Code Review Fix: GitHub failure should NOT stop the workflow
      mockGitHubService.createRepository.mockRejectedValue(new Error('GitHub API error'));

      await service.startProvisioning(projectId, workspaceId, {});

      // GitHub step should be marked as failed
      expect(mockProvisioningStatusService.updateStepStatus).toHaveBeenCalledWith(
        projectId,
        'github_repo_created',
        'failed',
        'GitHub API error',
      );

      // But overall status should still reach COMPLETED since GitHub is optional
      expect(mockProvisioningStatusService.updateOverallStatus).toHaveBeenCalledWith(
        projectId,
        ProvisioningStatusEnum.COMPLETED,
      );
    }, 15000);
  });

  describe('executeGitHubRepoCreation', () => {
    it('should create repo when GitHub integration is active', async () => {
      await service.executeGitHubRepoCreation(projectId);

      expect(mockIntegrationConnectionService.getDecryptedToken).toHaveBeenCalledWith(
        workspaceId,
        'github',
      );
      expect(mockGitHubService.createRepository).toHaveBeenCalledWith(
        'gho_test_token',
        'Test-Project', // sanitized: space replaced with hyphen
        expect.objectContaining({
          description: 'A test project description',
          private: true,
          autoInit: true,
          gitignoreTemplate: 'Node',
        }),
      );
    });

    it('should skip gracefully when no GitHub integration', async () => {
      mockIntegrationConnectionService.getDecryptedToken.mockRejectedValue(
        new NotFoundException('No active github integration found'),
      );

      await service.executeGitHubRepoCreation(projectId);

      // Should NOT call createRepository
      expect(mockGitHubService.createRepository).not.toHaveBeenCalled();

      // Should mark step as completed (skip gracefully)
      expect(mockProvisioningStatusService.updateStepStatus).toHaveBeenCalledWith(
        projectId,
        'github_repo_created',
        'completed',
      );
    });

    it('should sanitize project name for GitHub', async () => {
      // Project with spaces and special characters
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        name: 'My Awesome Project!@#$%',
      });

      await service.executeGitHubRepoCreation(projectId);

      expect(mockGitHubService.createRepository).toHaveBeenCalledWith(
        'gho_test_token',
        'My-Awesome-Project', // special chars replaced with hyphens, consecutive hyphens collapsed, trailing hyphens trimmed
        expect.any(Object),
      );
    });

    it('should use fallback name when sanitization results in empty string', async () => {
      // Project with only special characters
      mockProjectRepository.findOne.mockResolvedValue({
        ...mockProject,
        name: '!!!@@@###',
      });

      await service.executeGitHubRepoCreation(projectId);

      expect(mockGitHubService.createRepository).toHaveBeenCalledWith(
        'gho_test_token',
        `project-${projectId.substring(0, 8)}`, // fallback name
        expect.any(Object),
      );
    });

    it('should update project githubRepoUrl after creation', async () => {
      await service.executeGitHubRepoCreation(projectId);

      expect(mockProjectRepository.update).toHaveBeenCalledWith(projectId, {
        githubRepoUrl: 'https://github.com/testuser/Test-Project',
      });
    });

    it('should mark provisioning step as completed on success', async () => {
      await service.executeGitHubRepoCreation(projectId);

      expect(mockProvisioningStatusService.updateStepStatus).toHaveBeenCalledWith(
        projectId,
        'github_repo_created',
        'completed',
      );
    });

    it('should mark step as failed on GitHub API error without throwing', async () => {
      mockGitHubService.createRepository.mockRejectedValue(
        new Error('GitHub API rate limit exceeded'),
      );

      // Story 6.2 Code Review Fix: Should NOT throw - marks step as failed instead
      await service.executeGitHubRepoCreation(projectId);

      expect(mockProvisioningStatusService.updateStepStatus).toHaveBeenCalledWith(
        projectId,
        'github_repo_created',
        'failed',
        'GitHub API rate limit exceeded',
      );
    });

    it('should mark step as failed when project not found without throwing', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      // Story 6.2 Code Review Fix: Should NOT throw - marks step as failed instead
      await service.executeGitHubRepoCreation(projectId);

      expect(mockProvisioningStatusService.updateStepStatus).toHaveBeenCalledWith(
        projectId,
        'github_repo_created',
        'failed',
        `Project ${projectId} not found`,
      );
    });
  });

  describe('executeDatabaseProvisioning', () => {
    it('should simulate 2-second delay and mark as completed (placeholder)', async () => {
      const startTime = Date.now();

      await service.executeDatabaseProvisioning(projectId);

      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(1900);
      expect(duration).toBeLessThanOrEqual(2500);

      expect(mockProvisioningStatusService.updateStepStatus).toHaveBeenCalledWith(
        projectId,
        'database_provisioned',
        'completed',
      );
    }, 5000);
  });

  describe('executeDeploymentConfiguration', () => {
    it('should simulate 2-second delay and mark as completed (placeholder)', async () => {
      const startTime = Date.now();

      await service.executeDeploymentConfiguration(projectId);

      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(1900);
      expect(duration).toBeLessThanOrEqual(2500);

      expect(mockProvisioningStatusService.updateStepStatus).toHaveBeenCalledWith(
        projectId,
        'deployment_configured',
        'completed',
      );
    }, 5000);
  });

  describe('executeProjectInitialization', () => {
    it('should mark step as completed and update project status to active', async () => {
      await service.executeProjectInitialization(projectId);

      expect(mockProjectRepository.update).toHaveBeenCalledWith(projectId, {
        status: ProjectStatus.ACTIVE,
      });

      expect(mockProvisioningStatusService.updateStepStatus).toHaveBeenCalledWith(
        projectId,
        'project_initialized',
        'completed',
      );
    });
  });

  describe('handleStepFailure', () => {
    it('should log error and mark step as failed', async () => {
      const stepName = 'github_repo_created';
      const error = new Error('GitHub API timeout');

      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await service.handleStepFailure(projectId, stepName, error);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step github_repo_created failed'),
        expect.any(String),
      );

      expect(mockProvisioningStatusService.updateStepStatus).toHaveBeenCalledWith(
        projectId,
        stepName,
        'failed',
        error.message,
      );

      loggerSpy.mockRestore();
    });
  });
});
