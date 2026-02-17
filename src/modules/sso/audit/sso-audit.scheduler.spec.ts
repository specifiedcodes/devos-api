import { Test, TestingModule } from '@nestjs/testing';
import { SsoAuditScheduler } from './sso-audit.scheduler';
import { SsoAuditWebhookService } from './sso-audit-webhook.service';
import { SsoAuditExportService } from './sso-audit-export.service';
import { SSO_AUDIT_CONSTANTS } from '../constants/audit.constants';

describe('SsoAuditScheduler', () => {
  let scheduler: SsoAuditScheduler;

  const mockWebhookService = {
    processDeliveries: jest.fn(),
    cleanupDeliveryLogs: jest.fn(),
  };

  const mockExportService = {
    cleanupExpiredEvents: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoAuditScheduler,
        { provide: SsoAuditWebhookService, useValue: mockWebhookService },
        { provide: SsoAuditExportService, useValue: mockExportService },
      ],
    }).compile();

    scheduler = module.get<SsoAuditScheduler>(SsoAuditScheduler);
  });

  describe('handleWebhookDelivery', () => {
    it('should call processDeliveries and log result', async () => {
      mockWebhookService.processDeliveries.mockResolvedValue(5);
      await scheduler.handleWebhookDelivery();
      expect(mockWebhookService.processDeliveries).toHaveBeenCalledTimes(1);
    });

    it('should not throw on service error', async () => {
      mockWebhookService.processDeliveries.mockRejectedValue(new Error('DB error'));
      await expect(scheduler.handleWebhookDelivery()).resolves.not.toThrow();
    });

    it('should handle zero processed deliveries', async () => {
      mockWebhookService.processDeliveries.mockResolvedValue(0);
      await expect(scheduler.handleWebhookDelivery()).resolves.not.toThrow();
    });
  });

  describe('handleRetentionCleanup', () => {
    it('should call cleanupExpiredEvents with correct retention days', async () => {
      mockExportService.cleanupExpiredEvents.mockResolvedValue(100);
      mockWebhookService.cleanupDeliveryLogs.mockResolvedValue(50);

      await scheduler.handleRetentionCleanup();

      expect(mockExportService.cleanupExpiredEvents).toHaveBeenCalledWith(
        SSO_AUDIT_CONSTANTS.DEFAULT_RETENTION_DAYS,
      );
    });

    it('should clean up old webhook delivery logs', async () => {
      mockExportService.cleanupExpiredEvents.mockResolvedValue(0);
      mockWebhookService.cleanupDeliveryLogs.mockResolvedValue(25);

      await scheduler.handleRetentionCleanup();

      expect(mockWebhookService.cleanupDeliveryLogs).toHaveBeenCalledWith(
        SSO_AUDIT_CONSTANTS.WEBHOOK_DELIVERY_LOG_RETENTION_DAYS,
      );
    });

    it('should not throw on service error', async () => {
      mockExportService.cleanupExpiredEvents.mockRejectedValue(new Error('DB error'));
      await expect(scheduler.handleRetentionCleanup()).resolves.not.toThrow();
    });
  });
});
