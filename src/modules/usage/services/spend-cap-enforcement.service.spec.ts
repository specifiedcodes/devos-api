import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  SpendCapEnforcementService,
  DEFAULT_DOWNGRADE_MAP,
  RoutingModifier,
} from './spend-cap-enforcement.service';
import { SpendCapService, SpendLevel, SpendCapStatus } from './spend-cap.service';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';

describe('SpendCapEnforcementService', () => {
  let service: SpendCapEnforcementService;
  let spendCapService: jest.Mocked<SpendCapService>;
  let workspaceSettingsRepo: any;

  const defaultSettings: Partial<WorkspaceSettings> = {
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

  const makeStatus = (overrides: Partial<SpendCapStatus> = {}): SpendCapStatus => ({
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
    ...overrides,
  });

  beforeEach(async () => {
    const mockSpendCapService = {
      getSpendCapStatus: jest.fn().mockResolvedValue(makeStatus()),
    };

    const mockRepo = {
      findOne: jest.fn().mockResolvedValue(defaultSettings),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpendCapEnforcementService,
        { provide: SpendCapService, useValue: mockSpendCapService },
        { provide: getRepositoryToken(WorkspaceSettings), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<SpendCapEnforcementService>(SpendCapEnforcementService);
    spendCapService = module.get(SpendCapService);
    workspaceSettingsRepo = module.get(getRepositoryToken(WorkspaceSettings));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---- evaluate tests ----

  describe('evaluate', () => {
    it('should return allowed=true, no modifier for NORMAL spend level', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(makeStatus());

      const result = await service.evaluate('ws-1', 'coding');

      expect(result.allowed).toBe(true);
      expect(result.routingModifier).toBeNull();
      expect(result.spendLevel).toBe(SpendLevel.NORMAL);
    });

    it('should return allowed=true with preferEconomy for WARNING spend level', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({ spendLevel: SpendLevel.WARNING, percentageUsed: 75 }),
      );

      const result = await service.evaluate('ws-1', 'coding');

      expect(result.allowed).toBe(true);
      expect(result.routingModifier).not.toBeNull();
      expect(result.routingModifier!.preferEconomy).toBe(true);
      expect(result.routingModifier!.forceEconomy).toBe(false);
      expect(result.spendLevel).toBe(SpendLevel.WARNING);
    });

    it('should return allowed=true with forceEconomy for DOWNGRADE spend level', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({ spendLevel: SpendLevel.DOWNGRADE, percentageUsed: 90 }),
      );

      const result = await service.evaluate('ws-1', 'coding');

      expect(result.allowed).toBe(true);
      expect(result.routingModifier).not.toBeNull();
      expect(result.routingModifier!.forceEconomy).toBe(true);
      expect(result.spendLevel).toBe(SpendLevel.DOWNGRADE);
    });

    it('should return allowed=true with blockNonCritical for CRITICAL spend level (simple_chat)', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({ spendLevel: SpendLevel.CRITICAL, percentageUsed: 97 }),
      );

      const result = await service.evaluate('ws-1', 'simple_chat');

      expect(result.allowed).toBe(true);
      expect(result.routingModifier).not.toBeNull();
      expect(result.routingModifier!.blockNonCritical).toBe(true);
      expect(result.spendLevel).toBe(SpendLevel.CRITICAL);
    });

    it('should return allowed=false for HARD_CAP', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({ spendLevel: SpendLevel.HARD_CAP, percentageUsed: 105 }),
      );

      const result = await service.evaluate('ws-1', 'coding');

      expect(result.allowed).toBe(false);
      expect(result.spendLevel).toBe(SpendLevel.HARD_CAP);
    });

    it('should return allowed=true for CRITICAL + taskType=simple_chat', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({ spendLevel: SpendLevel.CRITICAL, percentageUsed: 97 }),
      );

      const result = await service.evaluate('ws-1', 'simple_chat');
      expect(result.allowed).toBe(true);
    });

    it('should return allowed=false for CRITICAL + taskType=coding (non-critical blocked)', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({ spendLevel: SpendLevel.CRITICAL, percentageUsed: 97 }),
      );

      const result = await service.evaluate('ws-1', 'coding');
      expect(result.allowed).toBe(false);
    });

    it('should respect forcePremiumOverride (bypasses downgrade)', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({
          spendLevel: SpendLevel.DOWNGRADE,
          percentageUsed: 90,
          forcePremiumOverride: true,
        }),
      );

      const result = await service.evaluate('ws-1', 'coding');

      expect(result.allowed).toBe(true);
      expect(result.routingModifier).toBeNull();
    });

    it('should respect autoDowngradePaused (bypasses downgrade, not hard cap)', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({
          spendLevel: SpendLevel.DOWNGRADE,
          percentageUsed: 90,
          autoDowngradePaused: true,
        }),
      );

      const result = await service.evaluate('ws-1', 'coding');

      expect(result.allowed).toBe(true);
      expect(result.routingModifier).toBeNull();
    });

    it('should still enforce HARD_CAP even with forcePremiumOverride', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({
          spendLevel: SpendLevel.HARD_CAP,
          percentageUsed: 105,
          forcePremiumOverride: true,
        }),
      );

      const result = await service.evaluate('ws-1', 'coding');

      expect(result.allowed).toBe(false);
      expect(result.spendLevel).toBe(SpendLevel.HARD_CAP);
    });

    it('should return allowed=true, no modifier when spendCapEnabled is false', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({ spendCapEnabled: false }),
      );

      const result = await service.evaluate('ws-1', 'coding');

      expect(result.allowed).toBe(true);
      expect(result.routingModifier).toBeNull();
    });

    it('should apply custom downgrade rules from workspace settings during evaluate', async () => {
      spendCapService.getSpendCapStatus.mockResolvedValue(
        makeStatus({ spendLevel: SpendLevel.DOWNGRADE, percentageUsed: 90 }),
      );
      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        downgradeRules: {
          coding: { from: 'claude-sonnet-4', to: 'my-custom-model' },
        },
      });

      const result = await service.evaluate('ws-1', 'coding');

      expect(result.allowed).toBe(true);
      expect(result.routingModifier).not.toBeNull();
      expect(result.routingModifier!.downgradeMap.coding).toBe('my-custom-model');
    });
  });

  // ---- buildRoutingModifier tests ----

  describe('buildRoutingModifier', () => {
    it('should return correct modifier for each spend level', () => {
      const warning = service.buildRoutingModifier(SpendLevel.WARNING);
      expect(warning.preferEconomy).toBe(true);
      expect(warning.forceEconomy).toBe(false);
      expect(warning.blockNonCritical).toBe(false);

      const downgrade = service.buildRoutingModifier(SpendLevel.DOWNGRADE);
      expect(downgrade.preferEconomy).toBe(true);
      expect(downgrade.forceEconomy).toBe(true);
      expect(downgrade.blockNonCritical).toBe(false);

      const critical = service.buildRoutingModifier(SpendLevel.CRITICAL);
      expect(critical.preferEconomy).toBe(true);
      expect(critical.forceEconomy).toBe(true);
      expect(critical.blockNonCritical).toBe(true);

      const normal = service.buildRoutingModifier(SpendLevel.NORMAL);
      expect(normal.preferEconomy).toBe(false);
      expect(normal.forceEconomy).toBe(false);
      expect(normal.blockNonCritical).toBe(false);
    });

    it('should use custom downgrade rules when configured', () => {
      const settings = {
        downgradeRules: {
          coding: { from: 'claude-sonnet-4', to: 'my-custom-model' },
          planning: { from: 'claude-sonnet-4', to: 'my-planning-model' },
        },
      } as unknown as WorkspaceSettings;

      const result = service.buildRoutingModifier(SpendLevel.DOWNGRADE, settings);

      expect(result.downgradeMap.coding).toBe('my-custom-model');
      expect(result.downgradeMap.planning).toBe('my-planning-model');
      // Should NOT have default keys that weren't in custom rules
      expect(result.downgradeMap.summarization).toBeUndefined();
    });

    it('should use default downgrade map when no custom rules', () => {
      const result = service.buildRoutingModifier(SpendLevel.DOWNGRADE);

      expect(result.downgradeMap).toEqual(DEFAULT_DOWNGRADE_MAP);
    });
  });

  // ---- isOverrideActive tests ----

  describe('isOverrideActive', () => {
    it('should return true when forcePremiumOverride is true', () => {
      expect(
        service.isOverrideActive({ forcePremiumOverride: true, autoDowngradePaused: false }),
      ).toBe(true);
    });

    it('should return true when autoDowngradePaused is true', () => {
      expect(
        service.isOverrideActive({ forcePremiumOverride: false, autoDowngradePaused: true }),
      ).toBe(true);
    });

    it('should return false when both are false', () => {
      expect(
        service.isOverrideActive({ forcePremiumOverride: false, autoDowngradePaused: false }),
      ).toBe(false);
    });
  });
});
