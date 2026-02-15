/**
 * OrchestratorController Failure Endpoint Tests
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Tests manual override and recovery status endpoints.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrchestratorController } from './orchestrator.controller';
import { PipelineStateMachineService } from './services/pipeline-state-machine.service';
import { PipelineFailureRecoveryService } from './services/pipeline-failure-recovery.service';
import { FailureRecoveryHistory } from './entities/failure-recovery-history.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';

describe('OrchestratorController - Failure Endpoints', () => {
  let controller: OrchestratorController;
  let recoveryService: jest.Mocked<PipelineFailureRecoveryService>;
  let historyRepo: any;

  const mockReq = {
    user: { sub: 'user-123', userId: 'user-123' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrchestratorController],
      providers: [
        {
          provide: PipelineStateMachineService,
          useValue: {
            startPipeline: jest.fn(),
            getState: jest.fn(),
            pausePipeline: jest.fn(),
            resumePipeline: jest.fn(),
            getHistory: jest.fn(),
          },
        },
        {
          provide: PipelineFailureRecoveryService,
          useValue: {
            handleManualOverride: jest.fn().mockResolvedValue({
              success: true,
              strategy: 'manual_override',
              failureId: 'failure-001',
              retryCount: 0,
              newSessionId: null,
              checkpointUsed: null,
              error: null,
            }),
            getRecoveryStatus: jest.fn().mockResolvedValue({
              projectId: 'proj-789',
              activeFailures: [],
              recoveryHistory: [],
              isEscalated: false,
              totalRetries: 0,
              maxRetries: 3,
            }),
          },
        },
        {
          provide: getRepositoryToken(FailureRecoveryHistory),
          useValue: {
            findAndCount: jest.fn().mockResolvedValue([[], 0]),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrchestratorController>(OrchestratorController);
    recoveryService = module.get(PipelineFailureRecoveryService);
    historyRepo = module.get(getRepositoryToken(FailureRecoveryHistory));
  });

  describe('POST /:projectId/failures/:failureId/override', () => {
    it('should route to PipelineFailureRecoveryService', async () => {
      const result = await controller.handleManualOverride(
        'ws-456',
        'proj-789',
        'failure-001',
        { action: 'terminate' },
        mockReq,
      );

      expect(recoveryService.handleManualOverride).toHaveBeenCalledWith({
        failureId: 'failure-001',
        workspaceId: 'ws-456',
        userId: 'user-123',
        action: 'terminate',
      });
      expect(result.success).toBe(true);
    });

    it('should return 404 for unknown failure', async () => {
      recoveryService.handleManualOverride.mockRejectedValue(
        new NotFoundException('Failure not found'),
      );

      await expect(
        controller.handleManualOverride(
          'ws-456',
          'proj-789',
          'nonexistent',
          { action: 'terminate' },
          mockReq,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should pass guidance for provide_guidance action', async () => {
      await controller.handleManualOverride(
        'ws-456',
        'proj-789',
        'failure-001',
        {
          action: 'provide_guidance',
          guidance: 'Try a different approach',
        },
        mockReq,
      );

      expect(recoveryService.handleManualOverride).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'provide_guidance',
          guidance: 'Try a different approach',
        }),
      );
    });
  });

  describe('GET /:projectId/recovery-status', () => {
    it('should return current recovery status', async () => {
      const result = await controller.getRecoveryStatus('ws-456', 'proj-789');

      expect(recoveryService.getRecoveryStatus).toHaveBeenCalledWith('proj-789');
      expect(result.projectId).toBe('proj-789');
      expect(result.maxRetries).toBe(3);
    });
  });

  describe('GET /:projectId/failures', () => {
    it('should return paginated failure history', async () => {
      historyRepo.findAndCount.mockResolvedValue([
        [
          {
            id: 'h-1',
            failureType: 'crash',
            recoveryStrategy: 'retry',
            success: true,
          },
        ],
        1,
      ]);

      const result = await controller.getFailureHistory(
        'ws-456',
        'proj-789',
        { limit: 20, offset: 0 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should respect limit and offset parameters', async () => {
      historyRepo.findAndCount.mockResolvedValue([[], 0]);

      await controller.getFailureHistory('ws-456', 'proj-789', {
        limit: 10,
        offset: 5,
      });

      expect(historyRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 5,
        }),
      );
    });
  });
});
