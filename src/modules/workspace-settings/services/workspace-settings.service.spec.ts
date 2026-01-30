import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceSettingsService } from './workspace-settings.service';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';

describe('WorkspaceSettingsService - Spending Limits', () => {
  let service: WorkspaceSettingsService;
  let repository: Repository<WorkspaceSettings>;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceSettingsService,
        {
          provide: getRepositoryToken(WorkspaceSettings),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<WorkspaceSettingsService>(WorkspaceSettingsService);
    repository = module.get<Repository<WorkspaceSettings>>(
      getRepositoryToken(WorkspaceSettings),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setSpendingLimit', () => {
    it('should create new settings with spending limits when settings do not exist', async () => {
      const workspaceId = 'workspace-1';
      const monthlyLimitUsd = 100;
      const alertThresholds = [80, 90, 100];
      const limitEnabled = true;

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({
        workspaceId,
        monthlyLimitUsd,
        alertThresholds,
        limitEnabled,
        triggeredAlerts: {},
      });
      mockRepository.save.mockResolvedValue({
        workspaceId,
        monthlyLimitUsd,
        alertThresholds,
        limitEnabled,
        triggeredAlerts: {},
      });

      const result = await service.setSpendingLimit(
        workspaceId,
        monthlyLimitUsd,
        alertThresholds,
        limitEnabled,
      );

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { workspaceId },
      });
      expect(mockRepository.create).toHaveBeenCalledWith({
        workspaceId,
        monthlyLimitUsd,
        alertThresholds,
        limitEnabled,
        triggeredAlerts: {},
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.monthlyLimitUsd).toBe(monthlyLimitUsd);
      expect(result.limitEnabled).toBe(true);
    });

    it('should update existing settings with new spending limits', async () => {
      const workspaceId = 'workspace-1';
      const existingSettings = {
        workspaceId,
        monthlyLimitUsd: 50,
        alertThresholds: [80, 90],
        limitEnabled: false,
        triggeredAlerts: {},
      };

      mockRepository.findOne.mockResolvedValue(existingSettings);
      mockRepository.save.mockResolvedValue({
        ...existingSettings,
        monthlyLimitUsd: 100,
        alertThresholds: [80, 90, 100],
        limitEnabled: true,
      });

      const result = await service.setSpendingLimit(
        workspaceId,
        100,
        [80, 90, 100],
        true,
      );

      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.monthlyLimitUsd).toBe(100);
      expect(result.alertThresholds).toEqual([80, 90, 100]);
      expect(result.limitEnabled).toBe(true);
    });

    it('should reset triggered alerts when limit is disabled', async () => {
      const workspaceId = 'workspace-1';
      const existingSettings = {
        workspaceId,
        monthlyLimitUsd: 100,
        alertThresholds: [80, 90, 100],
        limitEnabled: true,
        triggeredAlerts: { '2026-01': [{ threshold: 80 }] },
      };

      mockRepository.findOne.mockResolvedValue(existingSettings);
      mockRepository.save.mockResolvedValue({
        ...existingSettings,
        limitEnabled: false,
        triggeredAlerts: {},
      });

      const result = await service.setSpendingLimit(
        workspaceId,
        100,
        [80, 90, 100],
        false,
      );

      expect(result.triggeredAlerts).toEqual({});
    });
  });

  describe('getSpendingLimits', () => {
    it('should return spending limits for existing settings', async () => {
      const workspaceId = 'workspace-1';
      const settings = {
        workspaceId,
        monthlyLimitUsd: 100,
        alertThresholds: [80, 90, 100],
        limitEnabled: true,
        triggeredAlerts: {},
      };

      mockRepository.findOne.mockResolvedValue(settings);

      const result = await service.getSpendingLimits(workspaceId);

      expect(result.monthly_limit_usd).toBe(100);
      expect(result.alert_thresholds).toEqual([80, 90, 100]);
      expect(result.limit_enabled).toBe(true);
    });

    it('should return default values when settings do not exist', async () => {
      const workspaceId = 'workspace-1';

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getSpendingLimits(workspaceId);

      expect(result.limit_enabled).toBe(false);
      expect(result.alert_thresholds).toEqual([80, 90, 100]);
      expect(result.monthly_limit_usd).toBeUndefined();
    });
  });
});
