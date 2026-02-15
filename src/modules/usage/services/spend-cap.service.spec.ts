import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SpendCapService, SpendLevel, SpendCapStatus } from './spend-cap.service';
import { UsageService } from './usage.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationService } from '../../notification/notification.service';
import { EmailService } from '../../email/email.service';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';

describe('SpendCapService', () => {
  let service: SpendCapService;
  let workspaceSettingsRepo: any;
  let usageService: jest.Mocked<UsageService>;
  let redisService: jest.Mocked<RedisService>;
  let notificationService: jest.Mocked<NotificationService>;
  let emailService: jest.Mocked<EmailService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

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
    triggeredAlerts: {},
    limitEnabled: true,
  };

  beforeEach(async () => {
    const mockRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
      manager: {
        transaction: jest.fn(),
      },
    };

    const mockUsageService = {
      getCurrentMonthSpend: jest.fn().mockResolvedValue(0),
    };

    const mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const mockNotificationService = {
      create: jest.fn().mockResolvedValue({}),
    };

    const mockEmailService = {
      sendSpendingAlert: jest.fn().mockResolvedValue(undefined),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpendCapService,
        { provide: getRepositoryToken(WorkspaceSettings), useValue: mockRepo },
        { provide: UsageService, useValue: mockUsageService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<SpendCapService>(SpendCapService);
    workspaceSettingsRepo = module.get(getRepositoryToken(WorkspaceSettings));
    usageService = module.get(UsageService);
    redisService = module.get(RedisService);
    notificationService = module.get(NotificationService);
    emailService = module.get(EmailService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---- getSpendLevel tests ----

  describe('getSpendLevel', () => {
    it('should return NORMAL when percentageUsed < warningThreshold', () => {
      const result = service.getSpendLevel(50, defaultSettings as WorkspaceSettings);
      expect(result).toBe(SpendLevel.NORMAL);
    });

    it('should return WARNING when percentageUsed >= warningThreshold and < downgradeThreshold', () => {
      const result = service.getSpendLevel(75, defaultSettings as WorkspaceSettings);
      expect(result).toBe(SpendLevel.WARNING);
    });

    it('should return DOWNGRADE when percentageUsed >= downgradeThreshold and < criticalThreshold', () => {
      const result = service.getSpendLevel(90, defaultSettings as WorkspaceSettings);
      expect(result).toBe(SpendLevel.DOWNGRADE);
    });

    it('should return CRITICAL when percentageUsed >= criticalThreshold and < hardCapThreshold', () => {
      const result = service.getSpendLevel(97, defaultSettings as WorkspaceSettings);
      expect(result).toBe(SpendLevel.CRITICAL);
    });

    it('should return HARD_CAP when percentageUsed >= hardCapThreshold', () => {
      const result = service.getSpendLevel(100, defaultSettings as WorkspaceSettings);
      expect(result).toBe(SpendLevel.HARD_CAP);
    });

    it('should return HARD_CAP when percentageUsed exceeds 100', () => {
      const result = service.getSpendLevel(120, defaultSettings as WorkspaceSettings);
      expect(result).toBe(SpendLevel.HARD_CAP);
    });

    it('should handle custom thresholds (non-default values)', () => {
      const customSettings = {
        ...defaultSettings,
        warningThreshold: 0.50,
        downgradeThreshold: 0.60,
        criticalThreshold: 0.80,
        hardCapThreshold: 0.90,
      } as WorkspaceSettings;

      expect(service.getSpendLevel(55, customSettings)).toBe(SpendLevel.WARNING);
      expect(service.getSpendLevel(65, customSettings)).toBe(SpendLevel.DOWNGRADE);
      expect(service.getSpendLevel(85, customSettings)).toBe(SpendLevel.CRITICAL);
      expect(service.getSpendLevel(95, customSettings)).toBe(SpendLevel.HARD_CAP);
    });

    it('should handle edge case at exactly threshold boundary', () => {
      // Exactly at warning threshold (70%)
      expect(service.getSpendLevel(70, defaultSettings as WorkspaceSettings)).toBe(SpendLevel.WARNING);
      // Exactly at downgrade threshold (85%)
      expect(service.getSpendLevel(85, defaultSettings as WorkspaceSettings)).toBe(SpendLevel.DOWNGRADE);
      // Exactly at critical threshold (95%)
      expect(service.getSpendLevel(95, defaultSettings as WorkspaceSettings)).toBe(SpendLevel.CRITICAL);
      // Exactly at hard cap threshold (100%)
      expect(service.getSpendLevel(100, defaultSettings as WorkspaceSettings)).toBe(SpendLevel.HARD_CAP);
    });
  });

  // ---- getSpendCapStatus tests ----

  describe('getSpendCapStatus', () => {
    it('should return complete status object with correct fields', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue(defaultSettings);
      usageService.getCurrentMonthSpend.mockResolvedValue(50);

      const status = await service.getSpendCapStatus('ws-1');

      expect(status).toHaveProperty('workspaceId', 'ws-1');
      expect(status).toHaveProperty('spendCapEnabled', true);
      expect(status).toHaveProperty('monthlyBudget', 100);
      expect(status).toHaveProperty('currentSpend', 50);
      expect(status).toHaveProperty('percentageUsed');
      expect(status).toHaveProperty('spendLevel');
      expect(status).toHaveProperty('isDowngraded');
      expect(status).toHaveProperty('isPaused');
      expect(status).toHaveProperty('forcePremiumOverride');
      expect(status).toHaveProperty('autoDowngradePaused');
      expect(status).toHaveProperty('remainingBudget');
      expect(status).toHaveProperty('projectedMonthlySpend');
    });

    it('should return spendCapEnabled=false when not configured', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        spendCapEnabled: false,
      });

      const status = await service.getSpendCapStatus('ws-1');
      expect(status.spendCapEnabled).toBe(false);
      expect(status.spendLevel).toBe(SpendLevel.NORMAL);
    });

    it('should use Redis cached value when available', async () => {
      const cached: SpendCapStatus = {
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

      redisService.get.mockResolvedValue(JSON.stringify(cached));

      const status = await service.getSpendCapStatus('ws-1');
      expect(status.currentSpend).toBe(50);
      expect(workspaceSettingsRepo.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from DB when Redis cache miss', async () => {
      redisService.get.mockResolvedValue(null);
      workspaceSettingsRepo.findOne.mockResolvedValue(defaultSettings);
      usageService.getCurrentMonthSpend.mockResolvedValue(60);

      const status = await service.getSpendCapStatus('ws-1');
      expect(status.currentSpend).toBe(60);
      expect(workspaceSettingsRepo.findOne).toHaveBeenCalled();
      expect(usageService.getCurrentMonthSpend).toHaveBeenCalledWith('ws-1');
    });
  });

  // ---- shouldDowngradeRouting tests ----

  describe('shouldDowngradeRouting', () => {
    it('should return false for NORMAL spend level', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue(defaultSettings);
      usageService.getCurrentMonthSpend.mockResolvedValue(30); // 30%
      const result = await service.shouldDowngradeRouting('ws-1');
      expect(result).toBe(false);
    });

    it('should return false for WARNING spend level (preference only)', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue(defaultSettings);
      usageService.getCurrentMonthSpend.mockResolvedValue(75); // 75%
      const result = await service.shouldDowngradeRouting('ws-1');
      expect(result).toBe(false);
    });

    it('should return true for DOWNGRADE spend level', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue(defaultSettings);
      usageService.getCurrentMonthSpend.mockResolvedValue(90); // 90%
      const result = await service.shouldDowngradeRouting('ws-1');
      expect(result).toBe(true);
    });

    it('should return true for CRITICAL spend level', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue(defaultSettings);
      usageService.getCurrentMonthSpend.mockResolvedValue(97); // 97%
      const result = await service.shouldDowngradeRouting('ws-1');
      expect(result).toBe(true);
    });

    it('should return false when autoDowngradePaused is true', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        autoDowngradePaused: true,
      });
      usageService.getCurrentMonthSpend.mockResolvedValue(90); // 90%
      const result = await service.shouldDowngradeRouting('ws-1');
      expect(result).toBe(false);
    });

    it('should return false when forcePremiumOverride is true', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        forcePremiumOverride: true,
      });
      usageService.getCurrentMonthSpend.mockResolvedValue(90); // 90%
      const result = await service.shouldDowngradeRouting('ws-1');
      expect(result).toBe(false);
    });
  });

  // ---- shouldBlockRequest tests ----

  describe('shouldBlockRequest', () => {
    it('should return false for all levels except HARD_CAP', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue(defaultSettings);
      usageService.getCurrentMonthSpend.mockResolvedValue(90); // 90% = DOWNGRADE
      expect(await service.shouldBlockRequest('ws-1')).toBe(false);
    });

    it('should return true for HARD_CAP', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue(defaultSettings);
      usageService.getCurrentMonthSpend.mockResolvedValue(105); // 105% = HARD_CAP
      expect(await service.shouldBlockRequest('ws-1')).toBe(true);
    });

    it('should return true even when forcePremiumOverride (hard cap is absolute)', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        forcePremiumOverride: true,
      });
      usageService.getCurrentMonthSpend.mockResolvedValue(105); // 105% = HARD_CAP
      expect(await service.shouldBlockRequest('ws-1')).toBe(true);
    });
  });

  // ---- getProjectedMonthlySpend tests ----

  describe('getProjectedMonthlySpend', () => {
    it('should correctly extrapolate from days elapsed', () => {
      // Mock date to the 15th of a 28-day month (Feb 2026)
      const mockNow = new Date(2026, 1, 15); // Feb 15, 2026
      jest.useFakeTimers();
      jest.setSystemTime(mockNow);

      const result = service.getProjectedMonthlySpend(50);
      // $50 / 15 days * 28 days = ~$93.33
      expect(result).toBeCloseTo(93.33, 1);

      jest.useRealTimers();
    });

    it('should handle first day of month (no data extrapolation)', () => {
      const mockNow = new Date(2026, 1, 1); // Feb 1, 2026
      jest.useFakeTimers();
      jest.setSystemTime(mockNow);

      const result = service.getProjectedMonthlySpend(10);
      // First day - return current spend as-is
      expect(result).toBe(10);

      jest.useRealTimers();
    });
  });

  // ---- invalidateCache tests ----

  describe('invalidateCache', () => {
    it('should remove Redis cached status', async () => {
      await service.invalidateCache('ws-1');
      expect(redisService.del).toHaveBeenCalledWith('workspace:ws-1:spend_cap_status');
    });
  });

  // ---- checkAndNotifyThresholds tests ----

  describe('checkAndNotifyThresholds', () => {
    it('should emit event when new threshold crossed', async () => {
      // Setup: workspace at WARNING level (75%)
      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        triggeredAlerts: {},
      });
      usageService.getCurrentMonthSpend.mockResolvedValue(75);
      workspaceSettingsRepo.manager.transaction.mockImplementation(async (cb: any) => {
        return cb({
          createQueryBuilder: () => ({
            where: () => ({
              setLock: () => ({
                getOne: () =>
                  Promise.resolve({
                    ...defaultSettings,
                    triggeredAlerts: {},
                  }),
              }),
            }),
          }),
          update: jest.fn().mockResolvedValue(undefined),
        });
      });

      await service.checkAndNotifyThresholds('ws-1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cost:threshold_reached',
        expect.objectContaining({
          workspaceId: 'ws-1',
          spendLevel: SpendLevel.WARNING,
        }),
      );
    });

    it('should not re-emit for already-triggered thresholds', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        triggeredAlerts: {
          [currentMonth]: [{ level: SpendLevel.WARNING, threshold: 0.70, triggered_at: '2026-02-10T00:00:00Z', spend: 70 }],
        },
      });
      usageService.getCurrentMonthSpend.mockResolvedValue(75);

      workspaceSettingsRepo.manager.transaction.mockImplementation(async (cb: any) => {
        return cb({
          createQueryBuilder: () => ({
            where: () => ({
              setLock: () => ({
                getOne: () =>
                  Promise.resolve({
                    ...defaultSettings,
                    triggeredAlerts: {
                      [currentMonth]: [{ level: SpendLevel.WARNING, threshold: 0.70, triggered_at: '2026-02-10T00:00:00Z', spend: 70 }],
                    },
                  }),
              }),
            }),
          }),
          update: jest.fn().mockResolvedValue(undefined),
        });
      });

      await service.checkAndNotifyThresholds('ws-1');

      // Should not emit for WARNING since it was already triggered
      const warningCalls = (eventEmitter.emit as jest.Mock).mock.calls.filter(
        (call) => call[0] === 'cost:threshold_reached' && call[1]?.spendLevel === SpendLevel.WARNING,
      );
      expect(warningCalls.length).toBe(0);
    });

    it('should create in-app notification via NotificationService', async () => {
      workspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        triggeredAlerts: {},
      });
      usageService.getCurrentMonthSpend.mockResolvedValue(75);
      workspaceSettingsRepo.manager.transaction.mockImplementation(async (cb: any) => {
        return cb({
          createQueryBuilder: () => ({
            where: () => ({
              setLock: () => ({
                getOne: () =>
                  Promise.resolve({
                    ...defaultSettings,
                    triggeredAlerts: {},
                  }),
              }),
            }),
          }),
          update: jest.fn().mockResolvedValue(undefined),
        });
      });

      await service.checkAndNotifyThresholds('ws-1');

      expect(notificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          type: 'spend_cap_alert',
        }),
      );
    });

    it('should send email via EmailService', async () => {
      workspaceSettingsRepo.findOne.mockImplementation(({ relations }: any) => {
        if (relations) {
          return Promise.resolve({
            ...defaultSettings,
            triggeredAlerts: {},
            workspace: {
              id: 'ws-1',
              name: 'Test Workspace',
              members: [
                { role: 'owner', user: { id: 'u-1', email: 'owner@test.com' } },
              ],
            },
          });
        }
        return Promise.resolve({
          ...defaultSettings,
          triggeredAlerts: {},
        });
      });
      usageService.getCurrentMonthSpend.mockResolvedValue(75);
      workspaceSettingsRepo.manager.transaction.mockImplementation(async (cb: any) => {
        return cb({
          createQueryBuilder: () => ({
            where: () => ({
              setLock: () => ({
                getOne: () =>
                  Promise.resolve({
                    ...defaultSettings,
                    triggeredAlerts: {},
                  }),
              }),
            }),
          }),
          update: jest.fn().mockResolvedValue(undefined),
        });
      });

      await service.checkAndNotifyThresholds('ws-1');

      expect(emailService.sendSpendingAlert).toHaveBeenCalledWith(
        'owner@test.com',
        'Test Workspace',
        70, // threshold * 100
        75, // currentSpend
        100, // monthlyBudget
        'ws-1',
      );
    });
  });
});
