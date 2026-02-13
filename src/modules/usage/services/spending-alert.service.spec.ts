import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpendingAlertService } from './spending-alert.service';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';
import { UsageService } from './usage.service';
import { NotificationService } from '../../notification/notification.service';
import { EmailService } from '../../email/email.service';

describe('SpendingAlertService', () => {
  let service: SpendingAlertService;
  let settingsRepository: Repository<WorkspaceSettings>;
  let usageService: UsageService;
  let notificationService: NotificationService;
  let emailService: EmailService;

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockTransactionalQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockTransactionalEntityManager = {
    createQueryBuilder: jest.fn(() => mockTransactionalQueryBuilder),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    manager: {
      transaction: jest.fn((callback: any) => callback(mockTransactionalEntityManager)),
    },
  };

  const mockUsageService = {
    getCurrentMonthSpend: jest.fn(),
  };

  const mockNotificationService = {
    create: jest.fn(),
  };

  const mockEmailService = {
    sendSpendingAlert: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpendingAlertService,
        {
          provide: getRepositoryToken(WorkspaceSettings),
          useValue: mockRepository,
        },
        {
          provide: UsageService,
          useValue: mockUsageService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<SpendingAlertService>(SpendingAlertService);
    settingsRepository = module.get<Repository<WorkspaceSettings>>(
      getRepositoryToken(WorkspaceSettings),
    );
    usageService = module.get<UsageService>(UsageService);
    notificationService =
      module.get<NotificationService>(NotificationService);
    emailService = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkSpendingAlerts', () => {
    it('should detect 80% threshold crossed and send alerts', async () => {
      const workspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        members: [
          {
            role: 'owner',
            user: { id: 'user-1', email: 'owner@example.com' },
          },
        ],
      };

      const settings = {
        workspaceId: 'workspace-1',
        monthlyLimitUsd: 100,
        alertThresholds: [80, 90, 100],
        limitEnabled: true,
        triggeredAlerts: {},
        workspace,
      };

      mockQueryBuilder.getMany.mockResolvedValue([settings]);
      mockUsageService.getCurrentMonthSpend.mockResolvedValue(80.0);
      mockNotificationService.create.mockResolvedValue({});
      mockEmailService.sendSpendingAlert.mockResolvedValue(undefined);

      // Mock transactional query to return the locked settings
      mockTransactionalQueryBuilder.getOne.mockResolvedValue({
        ...settings,
        triggeredAlerts: {},
      });

      await service.checkSpendingAlerts();

      expect(mockNotificationService.create).toHaveBeenCalledWith({
        workspaceId: 'workspace-1',
        userId: 'user-1',
        type: 'spending_alert',
        title: 'Spending Alert: 80% Budget Used',
        message: expect.stringContaining('80%'),
        metadata: { threshold: 80, currentSpend: 80.0, limit: 100 },
      });

      expect(mockEmailService.sendSpendingAlert).toHaveBeenCalledWith(
        'owner@example.com',
        'Test Workspace',
        80,
        80.0,
        100,
        'workspace-1',
      );

      expect(mockTransactionalEntityManager.update).toHaveBeenCalled();
    });

    it('should not re-trigger alert for same threshold', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const workspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        members: [
          {
            role: 'owner',
            user: { id: 'user-1', email: 'owner@example.com' },
          },
        ],
      };

      const settings = {
        workspaceId: 'workspace-1',
        monthlyLimitUsd: 100,
        alertThresholds: [80, 90, 100],
        limitEnabled: true,
        triggeredAlerts: {
          [currentMonth]: [
            { threshold: 80, triggered_at: '2026-01-25T10:00:00Z', spend: 80 },
          ],
        },
        workspace,
      };

      mockQueryBuilder.getMany.mockResolvedValue([settings]);
      mockUsageService.getCurrentMonthSpend.mockResolvedValue(85.0); // Still at 85%, threshold already triggered

      // Mock transactional query to return settings with 80% already triggered
      mockTransactionalQueryBuilder.getOne.mockResolvedValue({
        ...settings,
        triggeredAlerts: {
          [currentMonth]: [
            { threshold: 80, triggered_at: '2026-01-25T10:00:00Z', spend: 80 },
          ],
        },
      });

      await service.checkSpendingAlerts();

      expect(mockNotificationService.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendSpendingAlert).not.toHaveBeenCalled();
    });

    it('should trigger multiple thresholds progressively', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const workspace = {
        id: 'workspace-1',
        name: 'Test Workspace',
        members: [
          {
            role: 'owner',
            user: { id: 'user-1', email: 'owner@example.com' },
          },
        ],
      };

      const settings = {
        workspaceId: 'workspace-1',
        monthlyLimitUsd: 100,
        alertThresholds: [80, 90, 100],
        limitEnabled: true,
        triggeredAlerts: {
          [currentMonth]: [
            { threshold: 80, triggered_at: '2026-01-25T10:00:00Z', spend: 80 },
          ],
        },
        workspace,
      };

      mockQueryBuilder.getMany.mockResolvedValue([settings]);
      mockUsageService.getCurrentMonthSpend.mockResolvedValue(90.0); // Now at 90%

      // Mock transactional query to return settings with 80% already triggered
      mockTransactionalQueryBuilder.getOne.mockResolvedValue({
        ...settings,
        triggeredAlerts: {
          [currentMonth]: [
            { threshold: 80, triggered_at: '2026-01-25T10:00:00Z', spend: 80 },
          ],
        },
      });

      await service.checkSpendingAlerts();

      // Should only trigger 90% alert, not 80% again
      expect(mockNotificationService.create).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { threshold: 90, currentSpend: 90.0, limit: 100 },
        }),
      );
    });
  });
});
