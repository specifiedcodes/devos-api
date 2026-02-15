/**
 * DevOpsDeploymentMonitorService Tests
 * Story 11.7: DevOps Agent CLI Integration
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DevOpsDeploymentMonitorService } from './devops-deployment-monitor.service';
import { DeploymentMonitoringService } from '../../integrations/deployment-monitoring/deployment-monitoring.service';

describe('DevOpsDeploymentMonitorService', () => {
  let service: DevOpsDeploymentMonitorService;
  let deploymentMonitoring: jest.Mocked<DeploymentMonitoringService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const baseParams = {
    platform: 'railway' as const,
    deploymentId: 'deploy-123',
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    timeoutMs: 500,
    pollIntervalMs: 50,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevOpsDeploymentMonitorService,
        {
          provide: DeploymentMonitoringService,
          useValue: { getDeploymentDetail: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DevOpsDeploymentMonitorService>(DevOpsDeploymentMonitorService);
    deploymentMonitoring = module.get(DeploymentMonitoringService) as jest.Mocked<DeploymentMonitoringService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
  });

  describe('waitForDeployment', () => {
    it('should return success when deployment completes', async () => {
      deploymentMonitoring.getDeploymentDetail.mockResolvedValue({
        id: 'deploy-123',
        platform: 'railway',
        status: 'success',
        normalizedStatus: 'success',
        deploymentUrl: 'https://app.railway.app',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      } as any);

      const result = await service.waitForDeployment(baseParams);

      expect(result.status).toBe('success');
      expect(result.deploymentUrl).toBe('https://app.railway.app');
      expect(result.deployedAt).toBeInstanceOf(Date);
      expect(result.error).toBeNull();
    });

    it('should return failed when deployment fails', async () => {
      deploymentMonitoring.getDeploymentDetail.mockResolvedValue({
        id: 'deploy-123',
        platform: 'railway',
        status: 'failed',
        normalizedStatus: 'failed',
        deploymentUrl: null,
        startedAt: new Date().toISOString(),
        logs: 'Build error log here',
      } as any);

      const result = await service.waitForDeployment(baseParams);

      expect(result.status).toBe('failed');
      expect(result.buildLogs).toBe('Build error log here');
      expect(result.error).toContain('failed');
    });

    it('should return timeout when exceeding timeout', async () => {
      // Always return building status
      deploymentMonitoring.getDeploymentDetail.mockResolvedValue({
        id: 'deploy-123',
        platform: 'railway',
        status: 'building',
        normalizedStatus: 'building',
        deploymentUrl: null,
        startedAt: new Date().toISOString(),
      } as any);

      const result = await service.waitForDeployment({
        ...baseParams,
        timeoutMs: 150,
        pollIntervalMs: 50,
      });

      expect(result.status).toBe('timeout');
      expect(result.error).toContain('timed out');
    });

    it('should poll at configured interval', async () => {
      let callCount = 0;
      deploymentMonitoring.getDeploymentDetail.mockImplementation(async () => {
        callCount++;
        if (callCount >= 3) {
          return {
            id: 'deploy-123',
            platform: 'railway',
            status: 'success',
            normalizedStatus: 'success',
            deploymentUrl: 'https://app.railway.app',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          } as any;
        }
        return {
          id: 'deploy-123',
          platform: 'railway',
          status: 'building',
          normalizedStatus: 'building',
          deploymentUrl: null,
          startedAt: new Date().toISOString(),
        } as any;
      });

      const result = await service.waitForDeployment({
        ...baseParams,
        pollIntervalMs: 30,
        timeoutMs: 2000,
      });

      expect(result.status).toBe('success');
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('should emit progress events during polling', async () => {
      let callCount = 0;
      deploymentMonitoring.getDeploymentDetail.mockImplementation(async () => {
        callCount++;
        if (callCount >= 2) {
          return {
            id: 'deploy-123',
            platform: 'railway',
            status: 'success',
            normalizedStatus: 'success',
            deploymentUrl: 'https://app.railway.app',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          } as any;
        }
        return {
          id: 'deploy-123',
          platform: 'railway',
          status: 'building',
          normalizedStatus: 'building',
          deploymentUrl: null,
          startedAt: new Date().toISOString(),
        } as any;
      });

      await service.waitForDeployment({
        ...baseParams,
        pollIntervalMs: 30,
        timeoutMs: 2000,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'devops-agent:progress',
        expect.objectContaining({
          type: 'devops-agent:progress',
          step: 'monitoring-deployment',
        }),
      );
    });

    it('should capture build logs on failure', async () => {
      deploymentMonitoring.getDeploymentDetail.mockResolvedValue({
        id: 'deploy-123',
        platform: 'railway',
        status: 'crashed',
        normalizedStatus: 'crashed',
        deploymentUrl: null,
        startedAt: new Date().toISOString(),
        logs: 'Error: Module not found',
      } as any);

      const result = await service.waitForDeployment(baseParams);

      expect(result.status).toBe('failed');
      expect(result.buildLogs).toBe('Error: Module not found');
    });

    it('should handle deployment detail retrieval errors gracefully', async () => {
      let callCount = 0;
      deploymentMonitoring.getDeploymentDetail.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Network error');
        }
        return {
          id: 'deploy-123',
          platform: 'railway',
          status: 'success',
          normalizedStatus: 'success',
          deploymentUrl: 'https://app.railway.app',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        } as any;
      });

      const result = await service.waitForDeployment({
        ...baseParams,
        pollIntervalMs: 30,
        timeoutMs: 2000,
      });

      // Should recover and eventually get success
      expect(result.status).toBe('success');
    });
  });
});
