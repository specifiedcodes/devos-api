import { AlertNotificationService } from '../services/alert-notification.service';
import { AlertHistory } from '../../../database/entities/alert-history.entity';
import { AlertRule } from '../../../database/entities/alert-rule.entity';

describe('AlertNotificationService', () => {
  let service: AlertNotificationService;
  let mockAlertHistoryRepository: any;
  let mockUserRepository: any;
  let mockNotificationService: any;
  let mockEmailService: any;
  let mockConfigService: any;

  const mockRule: Partial<AlertRule> = {
    id: 'rule-1',
    name: 'Test Rule',
    severity: 'critical',
    channels: ['in_app', 'email', 'webhook'],
    metadata: {
      webhookUrl: 'https://hooks.slack.com/test',
      emailRecipients: ['admin@test.com', 'ops@test.com'],
    },
  };

  const mockAlert: Partial<AlertHistory> = {
    id: 'alert-1',
    alertRuleId: 'rule-1',
    alertName: 'Test Rule',
    severity: 'critical',
    status: 'fired',
    message: 'Test alert message',
    context: {
      condition: 'health.overall.status',
      operator: 'eq',
      threshold: 'unhealthy',
      currentValue: 'unhealthy',
    },
    firedAt: new Date(),
  };

  beforeEach(() => {
    mockAlertHistoryRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockUserRepository = {
      find: jest.fn().mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
      ]),
    };

    mockNotificationService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'ADMIN_ALERT_EMAIL') return 'fallback@test.com';
        if (key === 'FRONTEND_URL') return 'http://localhost:3000';
        return defaultValue;
      }),
    };

    service = new AlertNotificationService(
      mockAlertHistoryRepository,
      mockUserRepository,
      mockNotificationService,
      mockEmailService,
      mockConfigService,
    );
  });

  describe('sendAlertNotification', () => {
    it('should send in-app notification when channel includes in_app', async () => {
      const rule = { ...mockRule, channels: ['in_app'] } as AlertRule;
      await service.sendAlertNotification(mockAlert as AlertHistory, rule);
      expect(mockNotificationService.create).toHaveBeenCalled();
    });

    it('should send email when channel includes email', async () => {
      const rule = { ...mockRule, channels: ['email'] } as AlertRule;
      await service.sendAlertNotification(mockAlert as AlertHistory, rule);
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
    });

    it('should send webhook when channel includes webhook', async () => {
      // Mock fetch for webhook
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      const rule = { ...mockRule, channels: ['webhook'] } as AlertRule;
      await service.sendAlertNotification(mockAlert as AlertHistory, rule);
      expect(mockFetch).toHaveBeenCalled();

      // Restore
      delete (global as any).fetch;
    });

    it('should send to multiple channels simultaneously', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      await service.sendAlertNotification(
        mockAlert as AlertHistory,
        mockRule as AlertRule,
      );
      expect(mockNotificationService.create).toHaveBeenCalled();
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalled();

      delete (global as any).fetch;
    });

    it('should continue with other channels when one fails', async () => {
      mockNotificationService.create.mockRejectedValue(new Error('In-app failed'));
      const rule = { ...mockRule, channels: ['in_app', 'email'] } as AlertRule;
      // Should not throw
      await service.sendAlertNotification(mockAlert as AlertHistory, rule);
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
    });

    it('should record notified channels in alert history', async () => {
      const rule = { ...mockRule, channels: ['in_app'] } as AlertRule;
      await service.sendAlertNotification(mockAlert as AlertHistory, rule);
      expect(mockAlertHistoryRepository.update).toHaveBeenCalledWith(
        { id: 'alert-1' },
        { notifiedChannels: ['in_app'] },
      );
    });

    it('should handle empty channels array gracefully', async () => {
      const rule = { ...mockRule, channels: [] } as AlertRule;
      await service.sendAlertNotification(mockAlert as AlertHistory, rule);
      expect(mockNotificationService.create).not.toHaveBeenCalled();
    });
  });

  describe('sendInAppAlert', () => {
    it('should create notification for all platform admin users', async () => {
      await service.sendInAppAlert(mockAlert as AlertHistory);
      expect(mockUserRepository.find).toHaveBeenCalledWith({
        where: { isPlatformAdmin: true },
        select: ['id'],
      });
      expect(mockNotificationService.create).toHaveBeenCalledTimes(2);
    });

    it('should create notification with correct title format with severity', async () => {
      await service.sendInAppAlert(mockAlert as AlertHistory);
      expect(mockNotificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '[CRITICAL] Test Rule',
          type: 'alert_fired',
        }),
      );
    });
  });

  describe('sendEmailAlert', () => {
    it('should send to configured email recipients from rule.metadata', async () => {
      await service.sendEmailAlert(
        mockAlert as AlertHistory,
        mockRule as AlertRule,
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('should fall back to ADMIN_ALERT_EMAIL env var when no custom recipients', async () => {
      const ruleNoRecipients = {
        ...mockRule,
        metadata: {},
      } as AlertRule;
      await service.sendEmailAlert(
        mockAlert as AlertHistory,
        ruleNoRecipients,
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'fallback@test.com' }),
      );
    });

    it('should use correct subject format with severity', async () => {
      await service.sendEmailAlert(
        mockAlert as AlertHistory,
        mockRule as AlertRule,
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '[DevOS CRITICAL] Test Rule',
        }),
      );
    });
  });

  describe('sendWebhookAlert', () => {
    it('should POST JSON payload to configured webhook URL', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      await service.sendWebhookAlert(
        mockAlert as AlertHistory,
        mockRule as AlertRule,
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      delete (global as any).fetch;
    });

    it('should send Slack-compatible payload with blocks format', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      await service.sendWebhookAlert(
        mockAlert as AlertHistory,
        mockRule as AlertRule,
      );
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toHaveProperty('text');
      expect(callBody).toHaveProperty('blocks');
      expect(callBody.blocks[0].type).toBe('header');

      delete (global as any).fetch;
    });

    it('should retry once on failure', async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' })
        .mockResolvedValueOnce({ ok: true });
      global.fetch = mockFetch;

      await service.sendWebhookAlert(
        mockAlert as AlertHistory,
        mockRule as AlertRule,
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);

      delete (global as any).fetch;
    });
  });
});
