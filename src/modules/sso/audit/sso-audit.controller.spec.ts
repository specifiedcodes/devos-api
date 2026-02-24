import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SsoAuditController } from './sso-audit.controller';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditExportService } from './sso-audit-export.service';
import { SsoAuditAlertService } from './sso-audit-alert.service';
import { SsoAuditWebhookService } from './sso-audit-webhook.service';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';

describe('SsoAuditController', () => {
  let controller: SsoAuditController;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '660e8400-e29b-41d4-a716-446655440000';
  const ruleId = '770e8400-e29b-41d4-a716-446655440000';
  const webhookId = '880e8400-e29b-41d4-a716-446655440000';

  const adminReq = { user: { id: userId } } as any;

  const mockWorkspaceMemberRepository = {
    findOne: jest.fn(),
  };

  const mockAuditService = {
    listEvents: jest.fn(),
  };

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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SsoAuditController],
      providers: [
        { provide: SsoAuditService, useValue: mockAuditService },
        { provide: SsoAuditExportService, useValue: mockExportService },
        { provide: SsoAuditAlertService, useValue: mockAlertService },
        { provide: SsoAuditWebhookService, useValue: mockWebhookService },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockWorkspaceMemberRepository },
      ],
    }).compile();

    controller = module.get<SsoAuditController>(SsoAuditController);

    // Default to admin user
    mockWorkspaceMemberRepository.findOne.mockResolvedValue({
      workspaceId,
      userId,
      role: WorkspaceRole.ADMIN,
    });
  });

  describe('listEvents', () => {
    it('should return paginated events for admin (200)', async () => {
      mockAuditService.listEvents.mockResolvedValue({
        events: [{ id: 'e1', eventType: 'saml_login_success', workspaceId, actorId: null, targetUserId: null, ipAddress: null, userAgent: null, details: {}, createdAt: new Date() }],
        total: 1,
        page: 1,
        limit: 50,
      });

      const result = await controller.listEvents(workspaceId, {}, adminReq);
      expect(result.events).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should reject non-admin users (403)', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({
        workspaceId,
        userId,
        role: WorkspaceRole.VIEWER,
      });

      await expect(controller.listEvents(workspaceId, {}, adminReq)).rejects.toThrow(ForbiddenException);
    });

    it('should apply filters correctly', async () => {
      mockAuditService.listEvents.mockResolvedValue({ events: [], total: 0, page: 1, limit: 50 });

      await controller.listEvents(workspaceId, {
        eventType: 'saml_login_success',
        page: 2,
        limit: 10,
      }, adminReq);

      expect(mockAuditService.listEvents).toHaveBeenCalledWith(workspaceId, expect.objectContaining({
        eventType: 'saml_login_success',
        page: 2,
        limit: 10,
      }));
    });
  });

  describe('exportEvents', () => {
    it('should return CSV with correct Content-Type and Content-Disposition', async () => {
      mockExportService.exportEvents.mockResolvedValue({
        format: 'csv',
        data: 'id,eventType\n"e1","saml_login_success"',
        filename: 'sso-audit-test.csv',
        rowCount: 1,
      });

      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await controller.exportEvents(workspaceId, { format: 'csv' } as any, adminReq, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('attachment'));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return JSON with correct Content-Type', async () => {
      mockExportService.exportEvents.mockResolvedValue({
        format: 'json',
        data: '[]',
        filename: 'sso-audit-test.json',
        rowCount: 0,
      });

      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as any;

      await controller.exportEvents(workspaceId, { format: 'json' } as any, adminReq, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });
  });

  describe('getComplianceReport', () => {
    it('should return correct report structure (200)', async () => {
      const report = {
        workspaceId,
        period: { from: '2026-01-01', to: '2026-02-01' },
        summary: { totalEvents: 10, totalLogins: 5, successfulLogins: 4, failedLogins: 1, uniqueUsers: 3, loginSuccessRate: 80 },
        providerHealth: [],
        provisioningReport: { totalProvisioned: 0, jitProvisioned: 0, scimProvisioned: 0, deactivated: 0, updated: 0 },
        enforcementReport: { enforcementEnabled: false, enforcementChanges: 0, blockedLogins: 0, bypassedLogins: 0 },
      };
      mockExportService.generateComplianceReport.mockResolvedValue(report);

      const result = await controller.getComplianceReport(workspaceId, {}, adminReq);
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.summary.totalEvents).toBe(10);
    });

    it('should default to 30-day period when dates not specified', async () => {
      mockExportService.generateComplianceReport.mockResolvedValue({
        workspaceId,
        period: { from: '', to: '' },
        summary: { totalEvents: 0, totalLogins: 0, successfulLogins: 0, failedLogins: 0, uniqueUsers: 0, loginSuccessRate: 100 },
        providerHealth: [],
        provisioningReport: { totalProvisioned: 0, jitProvisioned: 0, scimProvisioned: 0, deactivated: 0, updated: 0 },
        enforcementReport: { enforcementEnabled: false, enforcementChanges: 0, blockedLogins: 0, bypassedLogins: 0 },
      });

      await controller.getComplianceReport(workspaceId, {}, adminReq);

      expect(mockExportService.generateComplianceReport).toHaveBeenCalledWith(
        workspaceId,
        expect.any(Date),
        expect.any(Date),
      );
    });
  });

  describe('Alert Rules', () => {
    const mockRule = {
      id: ruleId,
      workspaceId,
      name: 'Test Alert',
      description: null,
      eventTypes: ['saml_login_failure'],
      threshold: 5,
      windowMinutes: 5,
      notificationChannels: [],
      isActive: true,
      cooldownMinutes: 30,
      lastTriggeredAt: null,
      triggerCount: 0,
      createdAt: new Date(),
    };

    it('should return all rules for workspace (200)', async () => {
      mockAlertService.listAlertRules.mockResolvedValue([mockRule]);
      const result = await controller.listAlertRules(workspaceId, adminReq);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Alert');
    });

    it('should create rule (201)', async () => {
      mockAlertService.createAlertRule.mockResolvedValue(mockRule);

      const result = await controller.createAlertRule(workspaceId, {
        name: 'Test Alert',
        eventTypes: ['saml_login_failure'],
        notificationChannels: [],
      } as any, adminReq);

      expect(result.id).toBe(ruleId);
    });

    it('should return rule by ID (200)', async () => {
      mockAlertService.getAlertRule.mockResolvedValue(mockRule);
      const result = await controller.getAlertRule(workspaceId, ruleId, adminReq);
      expect(result.id).toBe(ruleId);
    });

    it('should return 404 for unknown ID', async () => {
      mockAlertService.getAlertRule.mockRejectedValue(new NotFoundException());
      await expect(controller.getAlertRule(workspaceId, ruleId, adminReq)).rejects.toThrow(NotFoundException);
    });

    it('should update rule (200)', async () => {
      mockAlertService.updateAlertRule.mockResolvedValue({ ...mockRule, name: 'Updated' });

      const result = await controller.updateAlertRule(workspaceId, ruleId, { name: 'Updated' }, adminReq);
      expect(result.name).toBe('Updated');
    });

    it('should remove rule (204)', async () => {
      mockAlertService.deleteAlertRule.mockResolvedValue(undefined);
      await expect(controller.deleteAlertRule(workspaceId, ruleId, adminReq)).resolves.not.toThrow();
    });
  });

  describe('Webhooks', () => {
    const mockWebhook = {
      id: webhookId,
      workspaceId,
      name: 'Splunk',
      url: 'https://test.com/webhook',
      eventTypes: [],
      headers: {},
      isActive: true,
      retryCount: 3,
      timeoutMs: 10000,
      lastDeliveryAt: null,
      lastDeliveryStatus: null,
      consecutiveFailures: 0,
      createdAt: new Date(),
    };

    it('should return all webhooks (200)', async () => {
      mockWebhookService.listWebhooks.mockResolvedValue([mockWebhook]);
      const result = await controller.listWebhooks(workspaceId, adminReq);
      expect(result).toHaveLength(1);
    });

    it('should create webhook (201)', async () => {
      mockWebhookService.createWebhook.mockResolvedValue(mockWebhook);

      const result = await controller.createWebhook(workspaceId, {
        name: 'Splunk',
        url: 'https://test.com/webhook',
      } as any, adminReq);

      expect(result.id).toBe(webhookId);
    });

    it('should return webhook with masked secret', async () => {
      mockWebhookService.getWebhook.mockResolvedValue({ ...mockWebhook, secret: 'real-secret-value' });

      const result = await controller.getWebhook(workspaceId, webhookId, adminReq);
      expect(result.id).toBe(webhookId);
      // Secret should be masked, not exposed
      expect((result as any).secret).toBe('********');
    });

    it('should return null secret when not set', async () => {
      mockWebhookService.getWebhook.mockResolvedValue({ ...mockWebhook, secret: null });

      const result = await controller.getWebhook(workspaceId, webhookId, adminReq);
      expect((result as any).secret).toBeNull();
    });

    it('should update webhook (200)', async () => {
      mockWebhookService.updateWebhook.mockResolvedValue({ ...mockWebhook, name: 'Updated' });

      const result = await controller.updateWebhook(workspaceId, webhookId, { name: 'Updated' }, adminReq);
      expect(result.name).toBe('Updated');
    });

    it('should remove webhook (204)', async () => {
      mockWebhookService.deleteWebhook.mockResolvedValue(undefined);
      await expect(controller.deleteWebhook(workspaceId, webhookId, adminReq)).resolves.not.toThrow();
    });

    it('should return test result (200)', async () => {
      mockWebhookService.testWebhook.mockResolvedValue({ success: true, statusCode: 200 });

      const result = await controller.testWebhook(workspaceId, webhookId, adminReq);
      expect(result.success).toBe(true);
    });

    it('should return paginated deliveries (200)', async () => {
      mockWebhookService.listDeliveries.mockResolvedValue({
        deliveries: [{ id: 'del-1', webhookId, eventId: 'e1', status: 'success', statusCode: 200, errorMessage: null, attemptNumber: 1, deliveredAt: new Date(), createdAt: new Date() }],
        total: 1,
      });

      const result = await controller.listDeliveries(workspaceId, webhookId, adminReq, 1, 50);
      expect(result.deliveries).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('Authorization', () => {
    it('should reject non-admin for alert rules', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ role: WorkspaceRole.VIEWER });

      await expect(controller.listAlertRules(workspaceId, adminReq)).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-admin for webhooks', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ role: WorkspaceRole.VIEWER });

      await expect(controller.listWebhooks(workspaceId, adminReq)).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-admin for compliance report', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ role: WorkspaceRole.VIEWER });

      await expect(controller.getComplianceReport(workspaceId, {}, adminReq)).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner role', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue({ role: WorkspaceRole.OWNER });
      mockAlertService.listAlertRules.mockResolvedValue([]);

      const result = await controller.listAlertRules(workspaceId, adminReq);
      expect(result).toHaveLength(0);
    });

    it('should reject when no membership found', async () => {
      mockWorkspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(controller.listEvents(workspaceId, {}, adminReq)).rejects.toThrow(ForbiddenException);
    });
  });
});
