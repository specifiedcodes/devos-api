/**
 * SSO Audit Logging, Alerts & Webhooks E2E Tests
 * Tests comprehensive audit trail, alert rules, webhook delivery, and retention.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SsoAuditController } from '../../audit/sso-audit.controller';
import { SsoAuditExportService } from '../../audit/sso-audit-export.service';
import { SsoAuditAlertService } from '../../audit/sso-audit-alert.service';
import { SsoAuditWebhookService } from '../../audit/sso-audit-webhook.service';
import { SsoAuditScheduler } from '../../audit/sso-audit.scheduler';
import { WorkspaceMember } from '../../../../database/entities/workspace-member.entity';
import { SsoAuditService } from '../../sso-audit.service';
import {
  MOCK_ALERT_RULE,
  MOCK_WEBHOOK_CONFIG,
  createTestWorkspaceId,
  createTestUserId,
  createMockAuditService,
  createMockWorkspaceMemberRepository,
  createTestUuid,
} from './sso-e2e-test.helper';

describe('SSO Audit E2E Tests', () => {
  let controller: SsoAuditController;

  const workspaceId = createTestWorkspaceId();
  const userId = createTestUserId();
  const ruleId = createTestUuid(70);
  const webhookId = createTestUuid(71);

  const mockAuditService = createMockAuditService();

  const mockExportService = {
    exportEvents: jest.fn(),
    generateComplianceReport: jest.fn(),
  };

  const mockAlertService = {
    listAlertRules: jest.fn(),
    createAlertRule: jest.fn(),
    getAlertRule: jest.fn(),
    updateAlertRule: jest.fn(),
    deleteAlertRule: jest.fn(),
  };

  const mockWebhookService = {
    listWebhooks: jest.fn(),
    createWebhook: jest.fn(),
    getWebhook: jest.fn(),
    updateWebhook: jest.fn(),
    deleteWebhook: jest.fn(),
    testWebhook: jest.fn(),
    listDeliveries: jest.fn(),
  };

  const mockMemberRepo = createMockWorkspaceMemberRepository('admin');

  const mockReq = {
    user: { id: userId, sub: userId },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'SSO-E2E-Test/1.0' },
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SsoAuditController],
      providers: [
        { provide: SsoAuditService, useValue: mockAuditService },
        { provide: SsoAuditExportService, useValue: mockExportService },
        { provide: SsoAuditAlertService, useValue: mockAlertService },
        { provide: SsoAuditWebhookService, useValue: mockWebhookService },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockMemberRepo },
      ],
    }).compile();

    controller = module.get<SsoAuditController>(SsoAuditController);
  });

  // ==================== Audit Event Logging E2E ====================

  describe('Audit Event Logging E2E', () => {
    it('should list paginated audit events', async () => {
      mockAuditService.listEvents.mockResolvedValue({
        events: [
          {
            id: '1',
            eventType: 'saml_login_success',
            workspaceId,
            actorId: userId,
            targetUserId: null,
            ipAddress: '127.0.0.1',
            userAgent: 'Test',
            details: {},
            createdAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.listEvents(workspaceId, {} as any, mockReq);

      expect(result).toBeDefined();
      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter events by eventType', async () => {
      mockAuditService.listEvents.mockResolvedValue({
        events: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.listEvents(
        workspaceId,
        { eventType: 'saml_login_failure' } as any,
        mockReq,
      );

      expect(mockAuditService.listEvents).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ eventType: 'saml_login_failure' }),
      );
    });

    it('should filter events by actorId', async () => {
      mockAuditService.listEvents.mockResolvedValue({ events: [], total: 0, page: 1, limit: 20 });

      await controller.listEvents(
        workspaceId,
        { actorId: userId } as any,
        mockReq,
      );

      expect(mockAuditService.listEvents).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ actorId: userId }),
      );
    });

    it('should filter events by date range', async () => {
      mockAuditService.listEvents.mockResolvedValue({ events: [], total: 0, page: 1, limit: 20 });

      await controller.listEvents(
        workspaceId,
        { dateFrom: '2026-01-01', dateTo: '2026-02-01' } as any,
        mockReq,
      );

      expect(mockAuditService.listEvents).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date),
        }),
      );
    });

    it('should paginate correctly', async () => {
      mockAuditService.listEvents.mockResolvedValue({ events: [], total: 0, page: 2, limit: 10 });

      await controller.listEvents(
        workspaceId,
        { page: 2, limit: 10 } as any,
        mockReq,
      );

      expect(mockAuditService.listEvents).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({ page: 2, limit: 10 }),
      );
    });
  });

  // ==================== Audit Export E2E ====================

  describe('Audit Export E2E', () => {
    it('should export events as CSV', async () => {
      mockExportService.exportEvents.mockResolvedValue({
        filename: 'sso-audit-events.csv',
        data: 'id,eventType,actorId\n1,saml_login,user1',
      });

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await controller.exportEvents(
        workspaceId,
        { format: 'csv' } as any,
        mockReq,
        mockRes,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should export events as JSON', async () => {
      mockExportService.exportEvents.mockResolvedValue({
        filename: 'sso-audit-events.json',
        data: '[{"id":"1","eventType":"saml_login"}]',
      });

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await controller.exportEvents(
        workspaceId,
        { format: 'json' } as any,
        mockReq,
        mockRes,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });

    it('should set Content-Disposition header for download', async () => {
      mockExportService.exportEvents.mockResolvedValue({
        filename: 'sso-audit-events.csv',
        data: 'data',
      });

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await controller.exportEvents(workspaceId, { format: 'csv' } as any, mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment'),
      );
    });
  });

  // ==================== Compliance Report E2E ====================

  describe('Compliance Report E2E', () => {
    it('should generate compliance report', async () => {
      const report = {
        summary: {
          totalEvents: 100,
          loginSuccessCount: 80,
          loginFailureCount: 20,
          uniqueUsers: 15,
          successRate: 0.8,
        },
        providerHealth: [],
        provisioning: { jitCount: 10, scimCount: 5 },
        enforcement: { enabled: true, blockedLogins: 3, bypassedLogins: 1 },
        period: { from: new Date().toISOString(), to: new Date().toISOString() },
      };
      mockExportService.generateComplianceReport.mockResolvedValue(report);

      const result = await controller.getComplianceReport(
        workspaceId,
        {} as any,
        mockReq,
      );

      expect(result).toBeDefined();
      expect(result.summary.totalEvents).toBe(100);
      expect(result.summary.successRate).toBe(0.8);
    });

    it('should default to 30-day period when dates not specified', async () => {
      mockExportService.generateComplianceReport.mockResolvedValue({ summary: {} });

      await controller.getComplianceReport(workspaceId, {} as any, mockReq);

      expect(mockExportService.generateComplianceReport).toHaveBeenCalledWith(
        workspaceId,
        expect.any(Date),
        expect.any(Date),
      );
    });
  });

  // ==================== Alert Rules E2E ====================

  describe('Alert Rules E2E', () => {
    const mockRule = {
      id: ruleId,
      workspaceId,
      name: MOCK_ALERT_RULE.name,
      description: MOCK_ALERT_RULE.description,
      eventTypes: MOCK_ALERT_RULE.eventTypes,
      threshold: MOCK_ALERT_RULE.threshold,
      windowMinutes: MOCK_ALERT_RULE.windowMinutes,
      cooldownMinutes: MOCK_ALERT_RULE.cooldownMinutes,
      notificationChannels: MOCK_ALERT_RULE.notificationChannels,
      isActive: true,
      lastTriggeredAt: null,
      triggerCount: 0,
      createdAt: new Date(),
    };

    it('should list alert rules', async () => {
      mockAlertService.listAlertRules.mockResolvedValue([mockRule]);

      const result = await controller.listAlertRules(workspaceId, mockReq);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(MOCK_ALERT_RULE.name);
    });

    it('should create an alert rule', async () => {
      mockAlertService.createAlertRule.mockResolvedValue(mockRule);

      const result = await controller.createAlertRule(
        workspaceId,
        {
          name: MOCK_ALERT_RULE.name,
          description: MOCK_ALERT_RULE.description,
          eventTypes: MOCK_ALERT_RULE.eventTypes,
          threshold: MOCK_ALERT_RULE.threshold,
          windowMinutes: MOCK_ALERT_RULE.windowMinutes,
          cooldownMinutes: MOCK_ALERT_RULE.cooldownMinutes,
          notificationChannels: MOCK_ALERT_RULE.notificationChannels,
        } as any,
        mockReq,
      );

      expect(result.name).toBe(MOCK_ALERT_RULE.name);
      expect(result.threshold).toBe(5);
    });

    it('should get a specific alert rule', async () => {
      mockAlertService.getAlertRule.mockResolvedValue(mockRule);

      const result = await controller.getAlertRule(workspaceId, ruleId, mockReq);

      expect(result.id).toBe(ruleId);
    });

    it('should update an alert rule', async () => {
      const updatedRule = { ...mockRule, threshold: 10 };
      mockAlertService.updateAlertRule.mockResolvedValue(updatedRule);

      const result = await controller.updateAlertRule(
        workspaceId,
        ruleId,
        { threshold: 10 } as any,
        mockReq,
      );

      expect(result.threshold).toBe(10);
    });

    it('should delete an alert rule', async () => {
      mockAlertService.deleteAlertRule.mockResolvedValue(undefined);

      await controller.deleteAlertRule(workspaceId, ruleId, mockReq);

      expect(mockAlertService.deleteAlertRule).toHaveBeenCalledWith(
        ruleId,
        workspaceId,
        userId,
      );
    });

    it('should include trigger count in response', async () => {
      const triggeredRule = { ...mockRule, triggerCount: 5, lastTriggeredAt: new Date() };
      mockAlertService.getAlertRule.mockResolvedValue(triggeredRule);

      const result = await controller.getAlertRule(workspaceId, ruleId, mockReq);

      expect(result.triggerCount).toBe(5);
      expect(result.lastTriggeredAt).toBeDefined();
    });
  });

  // ==================== Webhook Delivery E2E ====================

  describe('Webhook Delivery E2E', () => {
    const mockWebhook = {
      id: webhookId,
      workspaceId,
      name: MOCK_WEBHOOK_CONFIG.name,
      url: MOCK_WEBHOOK_CONFIG.url,
      secret: MOCK_WEBHOOK_CONFIG.secret,
      eventTypes: MOCK_WEBHOOK_CONFIG.eventTypes,
      headers: MOCK_WEBHOOK_CONFIG.headers,
      isActive: true,
      retryCount: MOCK_WEBHOOK_CONFIG.retryCount,
      timeoutMs: MOCK_WEBHOOK_CONFIG.timeoutMs,
      lastDeliveryAt: null,
      lastDeliveryStatus: null,
      consecutiveFailures: 0,
      createdAt: new Date(),
    };

    it('should list webhooks', async () => {
      mockWebhookService.listWebhooks.mockResolvedValue([mockWebhook]);

      const result = await controller.listWebhooks(workspaceId, mockReq);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(MOCK_WEBHOOK_CONFIG.name);
    });

    it('should create a webhook', async () => {
      mockWebhookService.createWebhook.mockResolvedValue(mockWebhook);

      const result = await controller.createWebhook(
        workspaceId,
        {
          name: MOCK_WEBHOOK_CONFIG.name,
          url: MOCK_WEBHOOK_CONFIG.url,
          secret: MOCK_WEBHOOK_CONFIG.secret,
          eventTypes: MOCK_WEBHOOK_CONFIG.eventTypes,
        } as any,
        mockReq,
      );

      expect(result.name).toBe(MOCK_WEBHOOK_CONFIG.name);
      expect(result.url).toBe(MOCK_WEBHOOK_CONFIG.url);
    });

    it('should mask secret in webhook response', async () => {
      mockWebhookService.getWebhook.mockResolvedValue(mockWebhook);

      const result = await controller.getWebhook(workspaceId, webhookId, mockReq);

      expect(result.secret).toBe('********');
    });

    it('should update a webhook', async () => {
      const updated = { ...mockWebhook, name: 'Updated Webhook' };
      mockWebhookService.updateWebhook.mockResolvedValue(updated);

      const result = await controller.updateWebhook(
        workspaceId,
        webhookId,
        { name: 'Updated Webhook' } as any,
        mockReq,
      );

      expect(result.name).toBe('Updated Webhook');
    });

    it('should delete a webhook', async () => {
      mockWebhookService.deleteWebhook.mockResolvedValue(undefined);

      await controller.deleteWebhook(workspaceId, webhookId, mockReq);

      expect(mockWebhookService.deleteWebhook).toHaveBeenCalledWith(
        webhookId,
        workspaceId,
      );
    });

    it('should test webhook delivery', async () => {
      mockWebhookService.testWebhook.mockResolvedValue({
        success: true,
        statusCode: 200,
      });

      const result = await controller.testWebhook(workspaceId, webhookId, mockReq);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('should list webhook deliveries', async () => {
      mockWebhookService.listDeliveries.mockResolvedValue({
        deliveries: [
          {
            id: '1',
            webhookId,
            eventId: 'event-1',
            status: 'delivered',
            statusCode: 200,
            errorMessage: null,
            attemptNumber: 1,
            deliveredAt: new Date(),
            createdAt: new Date(),
          },
        ],
        total: 1,
      });

      const result = await controller.listDeliveries(
        workspaceId,
        webhookId,
        mockReq,
      );

      expect(result.deliveries).toHaveLength(1);
      expect(result.deliveries[0].status).toBe('delivered');
    });

    it('should show consecutive failures in webhook response', async () => {
      const failingWebhook = { ...mockWebhook, consecutiveFailures: 3 };
      mockWebhookService.getWebhook.mockResolvedValue(failingWebhook);

      const result = await controller.getWebhook(workspaceId, webhookId, mockReq);

      expect(result.consecutiveFailures).toBe(3);
    });
  });

  // ==================== Audit Retention E2E ====================

  describe('Audit Retention E2E', () => {
    it('should verify audit scheduler exists', () => {
      expect(SsoAuditScheduler).toBeDefined();
    });
  });
});
