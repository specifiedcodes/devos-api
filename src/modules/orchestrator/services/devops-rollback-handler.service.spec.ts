/**
 * DevOpsRollbackHandlerService Tests
 * Story 11.7: DevOps Agent CLI Integration
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DevOpsRollbackHandlerService } from './devops-rollback-handler.service';
import { DeploymentRollbackService } from '../../integrations/deployment-rollback/deployment-rollback.service';
import {
  DevOpsSmokeTestResults,
  DevOpsDeploymentStatus,
  DevOpsRollbackResult,
  DevOpsSmokeCheck,
} from '../interfaces/devops-agent-execution.interfaces';

describe('DevOpsRollbackHandlerService', () => {
  let service: DevOpsRollbackHandlerService;
  let rollbackService: jest.Mocked<DeploymentRollbackService>;

  const baseRollbackParams = {
    platform: 'railway' as const,
    deploymentId: 'deploy-123',
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    reason: 'Smoke tests failed',
  };

  const passedHealthCheck: DevOpsSmokeCheck = {
    name: 'Health Check',
    url: 'https://app.railway.app/api/health',
    method: 'GET',
    expectedStatus: 200,
    actualStatus: 200,
    passed: true,
    responseTimeMs: 100,
    error: null,
  };

  const failedHealthCheck: DevOpsSmokeCheck = {
    name: 'Health Check',
    url: 'https://app.railway.app/api/health',
    method: 'GET',
    expectedStatus: 200,
    actualStatus: 503,
    passed: false,
    responseTimeMs: 50,
    error: 'Service Unavailable',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevOpsRollbackHandlerService,
        {
          provide: DeploymentRollbackService,
          useValue: {
            initiateAutoRollback: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DevOpsRollbackHandlerService>(DevOpsRollbackHandlerService);
    rollbackService = module.get(DeploymentRollbackService) as jest.Mocked<DeploymentRollbackService>;
  });

  describe('performRollback', () => {
    it('should trigger rollback via DeploymentRollbackService', async () => {
      rollbackService.initiateAutoRollback.mockResolvedValue({
        id: 'rollback-1',
        status: 'completed',
        targetDeploymentId: 'deploy-prev-1',
        platform: 'railway',
        environment: 'production',
        reason: 'Smoke tests failed',
        createdAt: new Date().toISOString(),
      } as any);

      await service.performRollback(baseRollbackParams);

      expect(rollbackService.initiateAutoRollback).toHaveBeenCalledWith(
        'ws-123',
        'proj-456',
        'system',
        expect.objectContaining({
          platform: 'railway',
          deploymentId: 'deploy-123',
          reason: 'Smoke tests failed',
        }),
      );
    });

    it('should return previous deployment ID on success', async () => {
      rollbackService.initiateAutoRollback.mockResolvedValue({
        id: 'rollback-1',
        status: 'completed',
        targetDeploymentId: 'deploy-prev-1',
        platform: 'railway',
        environment: 'production',
        reason: 'Smoke tests failed',
        createdAt: new Date().toISOString(),
      } as any);

      const result = await service.performRollback(baseRollbackParams);

      expect(result.success).toBe(true);
      expect(result.previousDeploymentId).toBe('deploy-prev-1');
      expect(result.error).toBeNull();
    });

    it('should handle rollback failure gracefully', async () => {
      rollbackService.initiateAutoRollback.mockRejectedValue(
        new Error('No previous deployment found'),
      );

      const result = await service.performRollback(baseRollbackParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No previous deployment found');
      expect(result.previousDeploymentId).toBeNull();
    });
  });

  describe('createIncidentReport', () => {
    it('should create report with deployment failure details', () => {
      const deploymentStatus: DevOpsDeploymentStatus = {
        status: 'failed',
        deploymentUrl: null,
        deployedAt: null,
        buildLogs: 'Error: Module not found',
        error: 'Build failed: Module not found',
      };

      const report = service.createIncidentReport({
        storyId: 'story-789',
        deploymentId: 'deploy-123',
        deploymentUrl: null,
        failureReason: 'Deployment build failed',
        smokeTestResults: null,
        deploymentStatus,
        rollbackResult: {
          success: true,
          previousDeploymentId: 'deploy-prev',
          rollbackUrl: null,
          error: null,
        },
      });

      expect(report.failureType).toBe('deployment_failed');
      expect(report.severity).toBe('high');
      expect(report.rootCause).toContain('Build failed');
      expect(report.rollbackPerformed).toBe(true);
      expect(report.rollbackSuccessful).toBe(true);
    });

    it('should create report with smoke test failure details', () => {
      const smokeTestResults: DevOpsSmokeTestResults = {
        passed: false,
        healthCheck: failedHealthCheck,
        apiChecks: [],
        totalChecks: 1,
        passedChecks: 0,
        failedChecks: 1,
        durationMs: 5000,
        details: 'Health check failed',
      };

      const report = service.createIncidentReport({
        storyId: 'story-789',
        deploymentId: 'deploy-123',
        deploymentUrl: 'https://app.railway.app',
        failureReason: 'Smoke tests failed',
        smokeTestResults,
        deploymentStatus: null,
        rollbackResult: {
          success: true,
          previousDeploymentId: 'deploy-prev',
          rollbackUrl: null,
          error: null,
        },
      });

      expect(report.failureType).toBe('smoke_tests_failed');
      expect(report.severity).toBe('medium');
      expect(report.rootCause).toContain('Health check failed');
      expect(report.recommendations).toContain(
        'Review smoke test failures and fix failing endpoints',
      );
    });

    it('should set severity to critical when rollback fails', () => {
      const report = service.createIncidentReport({
        storyId: 'story-789',
        deploymentId: 'deploy-123',
        deploymentUrl: null,
        failureReason: 'Deployment failed',
        smokeTestResults: null,
        deploymentStatus: {
          status: 'failed',
          deploymentUrl: null,
          deployedAt: null,
          buildLogs: null,
          error: 'Build failed',
        },
        rollbackResult: {
          success: false,
          previousDeploymentId: null,
          rollbackUrl: null,
          error: 'Rollback failed: no previous deployment',
        },
      });

      expect(report.severity).toBe('critical');
      expect(report.rollbackPerformed).toBe(true);
      expect(report.rollbackSuccessful).toBe(false);
      expect(report.recommendations).toContain(
        'Manually verify production deployment state',
      );
    });

    it('should include recommendations for resolution', () => {
      const report = service.createIncidentReport({
        storyId: 'story-789',
        deploymentId: 'deploy-123',
        deploymentUrl: null,
        failureReason: 'Deployment timed out',
        smokeTestResults: null,
        deploymentStatus: {
          status: 'timeout',
          deploymentUrl: null,
          deployedAt: null,
          buildLogs: null,
          error: 'Deployment timed out',
        },
        rollbackResult: null,
      });

      expect(report.failureType).toBe('timeout');
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations).toContain(
        'Check deployment platform status for outages',
      );
    });

    it('should handle null rollback result (no rollback attempted)', () => {
      const report = service.createIncidentReport({
        storyId: 'story-789',
        deploymentId: 'deploy-123',
        deploymentUrl: null,
        failureReason: 'Deployment failed',
        smokeTestResults: null,
        deploymentStatus: {
          status: 'failed',
          deploymentUrl: null,
          deployedAt: null,
          buildLogs: null,
          error: 'Build failed',
        },
        rollbackResult: null,
      });

      expect(report.rollbackPerformed).toBe(false);
      expect(report.rollbackSuccessful).toBe(false);
      expect(report.resolution).toContain('No rollback performed');
    });

    it('should include API check failures in root cause', () => {
      const smokeTestResults: DevOpsSmokeTestResults = {
        passed: false,
        healthCheck: passedHealthCheck,
        apiChecks: [
          {
            name: 'Users API',
            url: 'https://app.railway.app/api/users',
            method: 'GET',
            expectedStatus: 200,
            actualStatus: 500,
            passed: false,
            responseTimeMs: 200,
            error: 'Internal Server Error',
          },
        ],
        totalChecks: 2,
        passedChecks: 1,
        failedChecks: 1,
        durationMs: 5000,
        details: 'API check failed',
      };

      const report = service.createIncidentReport({
        storyId: 'story-789',
        deploymentId: 'deploy-123',
        deploymentUrl: 'https://app.railway.app',
        failureReason: 'Smoke tests failed',
        smokeTestResults,
        deploymentStatus: null,
        rollbackResult: null,
      });

      expect(report.rootCause).toContain('Users API');
      expect(report.rootCause).toContain('Internal Server Error');
    });
  });
});
