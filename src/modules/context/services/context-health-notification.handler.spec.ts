/**
 * ContextHealthNotificationHandler Tests
 * Story 12.5: Context Health Indicators UI
 *
 * TDD: Tests written first, then implementation verified.
 * Tests notification dispatch on critical health transitions.
 */

// Mock ESM modules that cause Jest transform issues
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-v4'),
}));
jest.mock('neo4j-driver', () => ({
  default: {
    driver: jest.fn(),
  },
  auth: { basic: jest.fn() },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ContextHealthNotificationHandler } from './context-health-notification.handler';
import { NotificationDispatchService } from '../../notifications/services/notification-dispatch.service';
import { NotificationRecipientResolver } from '../../notifications/services/notification-recipient.resolver';
import { ContextHealthChangedEvent } from '../interfaces/context-health.interfaces';

describe('ContextHealthNotificationHandler', () => {
  let handler: ContextHealthNotificationHandler;
  let mockDispatchService: any;
  let mockRecipientResolver: any;
  let mockConfigService: any;

  const mockProjectId = 'proj-uuid-123';
  const mockWorkspaceId = 'ws-uuid-456';

  const mockRecipients = [
    { userId: 'user-1', workspaceId: mockWorkspaceId },
    { userId: 'user-2', workspaceId: mockWorkspaceId },
  ];

  const buildEvent = (
    previousHealth: string,
    currentHealth: string,
    issues: string[] = [],
  ): ContextHealthChangedEvent => ({
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    previousHealth: previousHealth as any,
    currentHealth: currentHealth as any,
    issues,
    timestamp: new Date().toISOString(),
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDispatchService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    mockRecipientResolver = {
      forWorkspace: jest.fn().mockResolvedValue(mockRecipients),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_HEALTH_CRITICAL_ALERT_DELAY_MINUTES: '60',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextHealthNotificationHandler,
        { provide: NotificationDispatchService, useValue: mockDispatchService },
        { provide: NotificationRecipientResolver, useValue: mockRecipientResolver },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    handler = module.get<ContextHealthNotificationHandler>(
      ContextHealthNotificationHandler,
    );
  });

  describe('handleHealthChanged', () => {
    it('should dispatch push notification when health degrades to critical', async () => {
      const event = buildEvent('degraded', 'critical', ['Tier 1 missing', 'Tier 2 missing']);

      await handler.handleHealthChanged(event);

      expect(mockRecipientResolver.forWorkspace).toHaveBeenCalledWith(mockWorkspaceId);
      expect(mockDispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'context_critical',
          urgency: 'high',
          batchable: false,
          recipients: mockRecipients,
          payload: expect.objectContaining({
            projectId: mockProjectId,
            workspaceId: mockWorkspaceId,
            issues: ['Tier 1 missing', 'Tier 2 missing'],
          }),
        }),
      );
    });

    it('should not dispatch notification for healthy -> degraded transition', async () => {
      const event = buildEvent('healthy', 'degraded', ['Graphiti disconnected']);

      await handler.handleHealthChanged(event);

      // Degraded is informational - no notification
      expect(mockDispatchService.dispatch).not.toHaveBeenCalled();
    });

    it('should dispatch email notification when critical persists > configured delay', async () => {
      // Use short delay for testing
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'CONTEXT_HEALTH_CRITICAL_ALERT_DELAY_MINUTES') return '0'; // 0 minutes = immediately
        return defaultValue;
      });

      // First call: enter critical
      const event1 = buildEvent('healthy', 'critical', ['Tier 1 missing']);
      await handler.handleHealthChanged(event1);

      // Reset mock to check second call
      mockDispatchService.dispatch.mockClear();

      // Second call: still critical (should trigger email since delay = 0)
      const event2 = buildEvent('degraded', 'critical', ['Tier 1 missing']);
      await handler.handleHealthChanged(event2);

      // Should dispatch email notification (sustained critical)
      expect(mockDispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'context_critical',
          payload: expect.objectContaining({
            sustained: true,
            criticalSince: expect.any(String),
          }),
        }),
      );
    });

    it('should reset critical timer when health improves', async () => {
      // Enter critical
      const event1 = buildEvent('healthy', 'critical', ['Tier 1 missing']);
      await handler.handleHealthChanged(event1);

      // Recover
      const event2 = buildEvent('critical', 'healthy', []);
      await handler.handleHealthChanged(event2);

      // Reset dispatch mock
      mockDispatchService.dispatch.mockClear();

      // Enter critical again - should dispatch NEW push notification (timer was reset)
      const event3 = buildEvent('healthy', 'critical', ['Tier 1 missing again']);
      await handler.handleHealthChanged(event3);

      expect(mockDispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'context_critical',
          urgency: 'high',
          payload: expect.objectContaining({
            issues: ['Tier 1 missing again'],
          }),
        }),
      );
    });

    it('should use NotificationDispatchService for notification delivery', async () => {
      const event = buildEvent('healthy', 'critical', ['Multiple tiers invalid']);

      await handler.handleHealthChanged(event);

      expect(mockDispatchService.dispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'context_critical',
        }),
      );
    });

    it('should resolve workspace recipients via NotificationRecipientResolver', async () => {
      const event = buildEvent('degraded', 'critical', ['Issues']);

      await handler.handleHealthChanged(event);

      expect(mockRecipientResolver.forWorkspace).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should not throw when dispatch fails', async () => {
      mockDispatchService.dispatch.mockRejectedValue(new Error('Dispatch failed'));

      const event = buildEvent('healthy', 'critical', ['Issues']);

      // Should not throw
      await expect(handler.handleHealthChanged(event)).resolves.not.toThrow();
    });

    it('should skip notification when no recipients found', async () => {
      mockRecipientResolver.forWorkspace.mockResolvedValue([]);

      const event = buildEvent('healthy', 'critical', ['Issues']);
      await handler.handleHealthChanged(event);

      expect(mockDispatchService.dispatch).not.toHaveBeenCalled();
    });
  });
});
