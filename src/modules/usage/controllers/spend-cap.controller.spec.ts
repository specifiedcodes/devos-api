import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SpendCapController } from './spend-cap.controller';
import { SpendCapService, SpendLevel, SpendCapStatus } from '../services/spend-cap.service';
import { SpendCapEnforcementService } from '../services/spend-cap-enforcement.service';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';
import { AuditService } from '../../../shared/audit/audit.service';

describe('SpendCapController', () => {
  let controller: SpendCapController;
  let spendCapService: jest.Mocked<SpendCapService>;
  let enforcementService: jest.Mocked<SpendCapEnforcementService>;
  let workspaceSettingsRepo: any;
  let auditService: jest.Mocked<AuditService>;

  const defaultStatus: SpendCapStatus = {
    workspaceId: 'ws-1',
    spendCapEnabled: true,
    monthlyBudget: 100,
    currentSpend: 50,
    percentageUsed: 50,
    spendLevel: SpendLevel.NORMAL,
    isDowngraded: false,
    isPaused: false,
    forcePremiumOverride: false,
    autoDowngradePaused: false,
    remainingBudget: 50,
    projectedMonthlySpend: 100,
  };

  const defaultSettings: Partial<WorkspaceSettings> = {
    id: 'settings-1',
    workspaceId: 'ws-1',
    spendCapEnabled: true,
    monthlyLimitUsd: 100,
    warningThreshold: 0.70,
    downgradeThreshold: 0.85,
    criticalThreshold: 0.95,
    hardCapThreshold: 1.00,
    downgradeRules: {},
    forcePremiumOverride: false,
    autoDowngradePaused: false,
  };

  const mockReq = { user: { id: 'user-1' } } as any;

  beforeEach(async () => {
    const mockSpendCapService = {
      getSpendCapStatus: jest.fn().mockResolvedValue(defaultStatus),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    const mockEnforcementService = {
      evaluate: jest.fn().mockResolvedValue({
        allowed: true,
        routingModifier: null,
        reason: 'Normal spend level',
        spendLevel: SpendLevel.NORMAL,
      }),
    };

    const mockRepo = {
      findOne: jest.fn().mockResolvedValue(defaultSettings),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpendCapController],
      providers: [
        { provide: SpendCapService, useValue: mockSpendCapService },
        { provide: SpendCapEnforcementService, useValue: mockEnforcementService },
        { provide: getRepositoryToken(WorkspaceSettings), useValue: mockRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    controller = module.get<SpendCapController>(SpendCapController);
    spendCapService = module.get(SpendCapService);
    enforcementService = module.get(SpendCapEnforcementService);
    workspaceSettingsRepo = module.get(getRepositoryToken(WorkspaceSettings));
    auditService = module.get(AuditService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---- GET /status tests ----

  describe('GET /status', () => {
    it('should return 200 with SpendCapStatus', async () => {
      const result = await controller.getStatus('ws-1');
      expect(result).toEqual(defaultStatus);
      expect(spendCapService.getSpendCapStatus).toHaveBeenCalledWith('ws-1');
    });

    it('should return correct spend level', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue({
        ...defaultStatus,
        spendLevel: SpendLevel.WARNING,
      });

      const result = await controller.getStatus('ws-1');
      expect(result.spendLevel).toBe(SpendLevel.WARNING);
    });
  });

  // ---- PUT /config tests ----

  describe('PUT /config', () => {
    it('should update spend cap configuration', async () => {
      const dto = { spendCapEnabled: true, warningThreshold: 0.60 };

      await controller.updateConfig('ws-1', dto, mockReq);

      expect(workspaceSettingsRepo.update).toHaveBeenCalledWith(
        { workspaceId: 'ws-1' },
        expect.objectContaining({ spendCapEnabled: true, warningThreshold: 0.60 }),
      );
    });

    it('should validate threshold ordering (warning < downgrade < critical < hard_cap)', async () => {
      // Valid: all in ascending order
      const validDto = {
        warningThreshold: 0.50,
        downgradeThreshold: 0.60,
        criticalThreshold: 0.70,
        hardCapThreshold: 0.80,
      };

      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        warningThreshold: 0.50,
        downgradeThreshold: 0.60,
        criticalThreshold: 0.70,
        hardCapThreshold: 0.80,
      });

      await expect(
        controller.updateConfig('ws-1', validDto, mockReq),
      ).resolves.toBeDefined();
    });

    it('should reject invalid threshold ordering', async () => {
      // Invalid: warning >= downgrade
      const invalidDto = {
        warningThreshold: 0.90,
        downgradeThreshold: 0.85,
      };

      await expect(
        controller.updateConfig('ws-1', invalidDto, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate monthlyBudget > 0 when spendCapEnabled', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        spendCapEnabled: false,
        monthlyLimitUsd: 0,
      });

      const dto = { spendCapEnabled: true };
      await expect(
        controller.updateConfig('ws-1', dto, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log changes to audit trail', async () => {
      const dto = { spendCapEnabled: true };
      await controller.updateConfig('ws-1', dto, mockReq);

      expect(auditService.log).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        expect.any(String), // AuditAction
        'workspace_settings',
        'settings-1',
        expect.objectContaining({ action: 'spend_cap_config_updated' }),
      );
    });

    it('should invalidate spend cap cache after update', async () => {
      const dto = { warningThreshold: 0.60 };
      await controller.updateConfig('ws-1', dto, mockReq);

      expect(spendCapService.invalidateCache).toHaveBeenCalledWith('ws-1');
    });
  });

  // ---- PUT /override tests ----

  describe('PUT /override', () => {
    it('should toggle forcePremiumOverride', async () => {
      const dto = { forcePremiumOverride: true };
      await controller.updateOverride('ws-1', dto, mockReq);

      expect(workspaceSettingsRepo.update).toHaveBeenCalledWith(
        { workspaceId: 'ws-1' },
        expect.objectContaining({ forcePremiumOverride: true }),
      );
    });

    it('should toggle autoDowngradePaused', async () => {
      const dto = { autoDowngradePaused: true };
      await controller.updateOverride('ws-1', dto, mockReq);

      expect(workspaceSettingsRepo.update).toHaveBeenCalledWith(
        { workspaceId: 'ws-1' },
        expect.objectContaining({ autoDowngradePaused: true }),
      );
    });

    it('should allow mid-month budget increase', async () => {
      const dto = { increaseBudgetTo: 200 };
      await controller.updateOverride('ws-1', dto, mockReq);

      expect(workspaceSettingsRepo.update).toHaveBeenCalledWith(
        { workspaceId: 'ws-1' },
        expect.objectContaining({ monthlyLimitUsd: 200 }),
      );
    });

    it('should reject decreasing budget via increaseBudgetTo', async () => {
      const dto = { increaseBudgetTo: 50 }; // Less than current 100

      await expect(
        controller.updateOverride('ws-1', dto, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log overrides to audit trail', async () => {
      const dto = { forcePremiumOverride: true };
      await controller.updateOverride('ws-1', dto, mockReq);

      expect(auditService.log).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        expect.any(String),
        'workspace_settings',
        'settings-1',
        expect.objectContaining({ action: 'spend_cap_override_updated' }),
      );
    });

    it('should invalidate spend cap cache after override', async () => {
      const dto = { forcePremiumOverride: true };
      await controller.updateOverride('ws-1', dto, mockReq);

      expect(spendCapService.invalidateCache).toHaveBeenCalledWith('ws-1');
    });
  });

  // ---- GET /evaluate tests ----

  describe('GET /evaluate', () => {
    it('should return enforcement decision for task type', async () => {
      const result = await controller.evaluate('ws-1', 'coding');

      expect(enforcementService.evaluate).toHaveBeenCalledWith('ws-1', 'coding');
      expect(result.allowed).toBe(true);
    });

    it('should return allowed=false at hard cap', async () => {
      enforcementService.evaluate.mockResolvedValue({
        allowed: false,
        routingModifier: null,
        reason: 'Budget exceeded',
        spendLevel: SpendLevel.HARD_CAP,
      });

      const result = await controller.evaluate('ws-1', 'coding');
      expect(result.allowed).toBe(false);
    });

    it('should return routing modifier at downgrade level', async () => {
      enforcementService.evaluate.mockResolvedValue({
        allowed: true,
        routingModifier: {
          preferEconomy: true,
          forceEconomy: true,
          blockNonCritical: false,
          downgradeMap: { coding: 'deepseek-chat' },
        },
        reason: 'Downgrade level',
        spendLevel: SpendLevel.DOWNGRADE,
      });

      const result = await controller.evaluate('ws-1', 'coding');
      expect(result.routingModifier).not.toBeNull();
      expect(result.routingModifier!.forceEconomy).toBe(true);
    });

    it('should require taskType query parameter', async () => {
      await expect(
        controller.evaluate('ws-1', ''),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
