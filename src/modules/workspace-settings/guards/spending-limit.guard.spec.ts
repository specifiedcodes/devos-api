import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SpendingLimitGuard } from './spending-limit.guard';
import { WorkspaceSettingsService } from '../services/workspace-settings.service';
import { UsageService } from '../../usage/services/usage.service';

describe('SpendingLimitGuard', () => {
  let guard: SpendingLimitGuard;
  let workspaceSettingsService: jest.Mocked<WorkspaceSettingsService>;
  let usageService: jest.Mocked<UsageService>;

  const mockExecutionContext = (
    workspaceId: string,
    user: any = { id: 'user-1', role: 'member' },
    query: Record<string, any> = {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { workspaceId },
          query,
          user,
        }),
      }),
    } as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpendingLimitGuard,
        {
          provide: Reflector,
          useValue: {},
        },
        {
          provide: WorkspaceSettingsService,
          useValue: {
            getSpendingLimits: jest.fn(),
          },
        },
        {
          provide: UsageService,
          useValue: {
            getCurrentMonthSpend: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<SpendingLimitGuard>(SpendingLimitGuard);
    workspaceSettingsService = module.get(WorkspaceSettingsService);
    usageService = module.get(UsageService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('when no spending limits configured', () => {
    it('should allow request if limit_enabled is false', async () => {
      workspaceSettingsService.getSpendingLimits.mockResolvedValue({
        limit_enabled: false,
        monthly_limit_usd: 100,
        alert_thresholds: [80, 90, 100],
        triggered_alerts: {},
      });

      const context = mockExecutionContext('workspace-1');
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow request if monthly_limit_usd is null', async () => {
      workspaceSettingsService.getSpendingLimits.mockResolvedValue({
        limit_enabled: true,
        monthly_limit_usd: undefined,
        alert_thresholds: [80, 90, 100],
        triggered_alerts: {},
      });

      const context = mockExecutionContext('workspace-1');
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('when spending limits configured', () => {
    it('should allow request when budget usage < 100%', async () => {
      workspaceSettingsService.getSpendingLimits.mockResolvedValue({
        limit_enabled: true,
        monthly_limit_usd: 100,
        alert_thresholds: [80, 90, 100],
        triggered_alerts: {},
      });

      usageService.getCurrentMonthSpend.mockResolvedValue(80); // 80% usage

      const context = mockExecutionContext('workspace-1');
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should block request when budget usage >= 100%', async () => {
      workspaceSettingsService.getSpendingLimits.mockResolvedValue({
        limit_enabled: true,
        monthly_limit_usd: 100,
        alert_thresholds: [80, 90, 100],
        triggered_alerts: {},
      });

      usageService.getCurrentMonthSpend.mockResolvedValue(100); // 100% usage

      const context = mockExecutionContext('workspace-1');

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw correct error details when blocking', async () => {
      workspaceSettingsService.getSpendingLimits.mockResolvedValue({
        limit_enabled: true,
        monthly_limit_usd: 100,
        alert_thresholds: [80, 90, 100],
        triggered_alerts: {},
      });

      usageService.getCurrentMonthSpend.mockResolvedValue(105.5); // 105.5% usage

      const context = mockExecutionContext('workspace-1');

      try {
        await guard.canActivate(context);
        fail('Expected ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const response = (error as any).response;
        expect(response.message).toBe('Monthly budget reached');
        expect(response.errorCode).toBe('BYOK_QUOTA_EXCEEDED');
        expect(response.details.currentSpend).toBe(105.5);
        expect(response.details.limit).toBe(100);
        expect(response.details.percentageUsed).toBe(106);
      }
    });
  });

  describe('budget override mechanism', () => {
    it('should allow override when user is owner and allow_budget_override=true', async () => {
      workspaceSettingsService.getSpendingLimits.mockResolvedValue({
        limit_enabled: true,
        monthly_limit_usd: 100,
        alert_thresholds: [80, 90, 100],
        triggered_alerts: {},
      });

      usageService.getCurrentMonthSpend.mockResolvedValue(100); // 100% usage

      const context = mockExecutionContext(
        'workspace-1',
        { id: 'user-1', role: 'owner' },
        { allow_budget_override: 'true' },
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow override when user has workspaceRole=owner', async () => {
      workspaceSettingsService.getSpendingLimits.mockResolvedValue({
        limit_enabled: true,
        monthly_limit_usd: 100,
        alert_thresholds: [80, 90, 100],
        triggered_alerts: {},
      });

      usageService.getCurrentMonthSpend.mockResolvedValue(100); // 100% usage

      const context = mockExecutionContext(
        'workspace-1',
        { id: 'user-1', workspaceRole: 'owner' },
        { allow_budget_override: 'true' },
      );

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should block override when user is not owner', async () => {
      workspaceSettingsService.getSpendingLimits.mockResolvedValue({
        limit_enabled: true,
        monthly_limit_usd: 100,
        alert_thresholds: [80, 90, 100],
        triggered_alerts: {},
      });

      usageService.getCurrentMonthSpend.mockResolvedValue(100); // 100% usage

      const context = mockExecutionContext(
        'workspace-1',
        { id: 'user-1', role: 'member' },
        { allow_budget_override: 'true' },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should block when override flag not provided', async () => {
      workspaceSettingsService.getSpendingLimits.mockResolvedValue({
        limit_enabled: true,
        monthly_limit_usd: 100,
        alert_thresholds: [80, 90, 100],
        triggered_alerts: {},
      });

      usageService.getCurrentMonthSpend.mockResolvedValue(100); // 100% usage

      const context = mockExecutionContext(
        'workspace-1',
        { id: 'user-1', role: 'owner' },
        {}, // No allow_budget_override
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('edge cases', () => {
    it('should allow request when no workspaceId in params', async () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            params: {},
            query: {},
            user: { id: 'user-1' },
          }),
        }),
      } as ExecutionContext;

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(workspaceSettingsService.getSpendingLimits).not.toHaveBeenCalled();
    });
  });
});
