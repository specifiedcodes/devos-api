/**
 * DevOpsDeploymentTriggerService Tests
 * Story 11.7: DevOps Agent CLI Integration
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DevOpsDeploymentTriggerService } from './devops-deployment-trigger.service';
import { RailwayService } from '../../integrations/railway/railway.service';
import { VercelService } from '../../integrations/vercel/vercel.service';
import { IntegrationConnectionService } from '../../integrations/integration-connection.service';
import { IntegrationProvider } from '../../../database/entities/integration-connection.entity';

describe('DevOpsDeploymentTriggerService', () => {
  let service: DevOpsDeploymentTriggerService;
  let railwayService: jest.Mocked<RailwayService>;
  let vercelService: jest.Mocked<VercelService>;
  let integrationService: jest.Mocked<IntegrationConnectionService>;

  const baseDeployParams = {
    platform: 'railway' as const,
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    environment: 'staging',
    commitHash: 'abc123',
    githubToken: 'ghp_test',
    repoOwner: 'org',
    repoName: 'repo',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevOpsDeploymentTriggerService,
        {
          provide: RailwayService,
          useValue: { triggerDeployment: jest.fn() },
        },
        {
          provide: VercelService,
          useValue: { triggerDeployment: jest.fn() },
        },
        {
          provide: IntegrationConnectionService,
          useValue: { getDecryptedToken: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DevOpsDeploymentTriggerService>(DevOpsDeploymentTriggerService);
    railwayService = module.get(RailwayService) as jest.Mocked<RailwayService>;
    vercelService = module.get(VercelService) as jest.Mocked<VercelService>;
    integrationService = module.get(IntegrationConnectionService) as jest.Mocked<IntegrationConnectionService>;
  });

  describe('detectPlatform', () => {
    it('should return railway when specified explicitly', async () => {
      const result = await service.detectPlatform({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        preferredPlatform: 'railway',
      });

      expect(result).toBe('railway');
    });

    it('should return vercel when specified explicitly', async () => {
      const result = await service.detectPlatform({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        preferredPlatform: 'vercel',
      });

      expect(result).toBe('vercel');
    });

    it('should auto-detect Railway when both available', async () => {
      integrationService.getDecryptedToken.mockResolvedValue('railway-token');

      const result = await service.detectPlatform({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        preferredPlatform: 'auto',
      });

      expect(result).toBe('railway');
      expect(integrationService.getDecryptedToken).toHaveBeenCalledWith(
        'ws-123',
        IntegrationProvider.RAILWAY,
      );
    });

    it('should fall back to Vercel when Railway not available', async () => {
      integrationService.getDecryptedToken
        .mockRejectedValueOnce(new Error('No Railway integration'))
        .mockResolvedValueOnce('vercel-token');

      const result = await service.detectPlatform({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        preferredPlatform: 'auto',
      });

      expect(result).toBe('vercel');
    });

    it('should return null when no platform configured', async () => {
      integrationService.getDecryptedToken
        .mockRejectedValueOnce(new Error('No Railway'))
        .mockRejectedValueOnce(new Error('No Vercel'));

      const result = await service.detectPlatform({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        preferredPlatform: 'auto',
      });

      expect(result).toBeNull();
    });
  });

  describe('triggerDeployment', () => {
    it('should trigger Railway deployment via RailwayService', async () => {
      integrationService.getDecryptedToken.mockResolvedValue('railway-token');
      railwayService.triggerDeployment.mockResolvedValue({
        id: 'deploy-123',
        status: 'building',
        projectId: 'proj-456',
        deploymentUrl: 'app.railway.app',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);

      const result = await service.triggerDeployment(baseDeployParams);

      expect(result.success).toBe(true);
      expect(result.platform).toBe('railway');
      expect(railwayService.triggerDeployment).toHaveBeenCalledWith(
        'railway-token',
        expect.objectContaining({ projectId: 'proj-456', branch: 'main' }),
      );
    });

    it('should trigger Vercel deployment via VercelService', async () => {
      integrationService.getDecryptedToken.mockResolvedValue('vercel-token');
      vercelService.triggerDeployment.mockResolvedValue({
        id: 'deploy-456',
        url: 'app.vercel.app',
        state: 'BUILDING',
        createdAt: new Date().toISOString(),
      } as any);

      const result = await service.triggerDeployment({
        ...baseDeployParams,
        platform: 'vercel',
      });

      expect(result.success).toBe(true);
      expect(result.platform).toBe('vercel');
      expect(vercelService.triggerDeployment).toHaveBeenCalled();
    });

    it('should return deployment ID and URL on success', async () => {
      integrationService.getDecryptedToken.mockResolvedValue('railway-token');
      railwayService.triggerDeployment.mockResolvedValue({
        id: 'deploy-789',
        status: 'building',
        projectId: 'proj-456',
        deploymentUrl: 'myapp.railway.app',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any);

      const result = await service.triggerDeployment(baseDeployParams);

      expect(result.deploymentId).toBe('deploy-789');
      expect(result.deploymentUrl).toBe('myapp.railway.app');
      expect(result.error).toBeNull();
    });

    it('should return error on deployment trigger failure', async () => {
      integrationService.getDecryptedToken.mockResolvedValue('railway-token');
      railwayService.triggerDeployment.mockRejectedValue(
        new Error('Rate limit exceeded'),
      );

      const result = await service.triggerDeployment(baseDeployParams);

      expect(result.success).toBe(false);
      expect(result.deploymentId).toBeNull();
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should pass commit hash to deployment platform', async () => {
      integrationService.getDecryptedToken.mockResolvedValue('vercel-token');
      vercelService.triggerDeployment.mockResolvedValue({
        id: 'deploy-commit',
        url: 'app.vercel.app',
        state: 'BUILDING',
        createdAt: new Date().toISOString(),
      } as any);

      await service.triggerDeployment({
        ...baseDeployParams,
        platform: 'vercel',
        commitHash: 'def456',
      });

      expect(vercelService.triggerDeployment).toHaveBeenCalledWith(
        'vercel-token',
        expect.objectContaining({ ref: 'def456' }),
      );
    });

    it('should handle integration token retrieval failure', async () => {
      integrationService.getDecryptedToken.mockRejectedValue(
        new Error('Integration not connected'),
      );

      const result = await service.triggerDeployment(baseDeployParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Integration not connected');
    });
  });
});
