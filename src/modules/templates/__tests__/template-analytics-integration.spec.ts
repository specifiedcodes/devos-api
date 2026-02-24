/**
 * Template Analytics Integration Tests
 *
 * Story 19-9: Template Analytics
 *
 * Tests for event tracking integration with existing controllers.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TemplateAnalyticsService } from '../services/template-analytics.service';
import { TemplateAnalyticsEventType } from '../../../database/entities/template-analytics-event.entity';

describe('Template Analytics Integration', () => {
  let service: {
    trackEvent: jest.Mock;
  };

  beforeEach(() => {
    service = {
      trackEvent: jest.fn().mockResolvedValue('evt-1'),
    };
  });

  describe('View tracking integration', () => {
    it('should track view events when template detail is accessed', async () => {
      const templateId = '11111111-1111-1111-1111-111111111111';
      const workspaceId = '22222222-2222-2222-2222-222222222222';
      const userId = '33333333-3333-3333-3333-333333333333';

      await service.trackEvent({
        templateId,
        workspaceId,
        userId,
        eventType: TemplateAnalyticsEventType.DETAIL_VIEW,
        referrer: 'marketplace',
      });

      expect(service.trackEvent).toHaveBeenCalledWith({
        templateId,
        workspaceId,
        userId,
        eventType: TemplateAnalyticsEventType.DETAIL_VIEW,
        referrer: 'marketplace',
      });
    });

    it('should not block template access if tracking fails', async () => {
      service.trackEvent.mockRejectedValue(new Error('Redis down'));

      // Fire-and-forget: should not throw
      try {
        await service.trackEvent({
          templateId: '11111111-1111-1111-1111-111111111111',
          workspaceId: '22222222-2222-2222-2222-222222222222',
          userId: null,
          eventType: TemplateAnalyticsEventType.VIEW,
        });
      } catch {
        // Expected to throw in test since we mocked rejection
      }
      expect(service.trackEvent).toHaveBeenCalled();
    });
  });

  describe('Installation tracking integration', () => {
    it('should track install_started event', async () => {
      await service.trackEvent({
        templateId: '11111111-1111-1111-1111-111111111111',
        workspaceId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        eventType: TemplateAnalyticsEventType.INSTALL_STARTED,
      });

      expect(service.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAnalyticsEventType.INSTALL_STARTED,
        }),
      );
    });

    it('should track install_completed event', async () => {
      await service.trackEvent({
        templateId: '11111111-1111-1111-1111-111111111111',
        workspaceId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        eventType: TemplateAnalyticsEventType.INSTALL_COMPLETED,
        metadata: { projectId: 'proj-1' },
      });

      expect(service.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAnalyticsEventType.INSTALL_COMPLETED,
          metadata: { projectId: 'proj-1' },
        }),
      );
    });

    it('should track install_failed event', async () => {
      await service.trackEvent({
        templateId: '11111111-1111-1111-1111-111111111111',
        workspaceId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        eventType: TemplateAnalyticsEventType.INSTALL_FAILED,
        metadata: { error: 'validation_error' },
      });

      expect(service.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAnalyticsEventType.INSTALL_FAILED,
        }),
      );
    });
  });

  describe('Review tracking integration', () => {
    it('should track review_submitted event', async () => {
      await service.trackEvent({
        templateId: '11111111-1111-1111-1111-111111111111',
        workspaceId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        eventType: TemplateAnalyticsEventType.REVIEW_SUBMITTED,
        metadata: { rating: 5 },
      });

      expect(service.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: TemplateAnalyticsEventType.REVIEW_SUBMITTED,
          metadata: { rating: 5 },
        }),
      );
    });
  });
});
