/**
 * Webhook Event Types Tests
 * Story 21-8: Webhook Management (AC4)
 */

import {
  WebhookEventType,
  WEBHOOK_EVENT_CATEGORIES,
  ALL_WEBHOOK_EVENT_TYPES,
  isValidWebhookEventType,
} from '../constants/webhook-events';

describe('WebhookEventTypes', () => {
  describe('ALL_WEBHOOK_EVENT_TYPES', () => {
    it('should contain all 14 event types', () => {
      expect(ALL_WEBHOOK_EVENT_TYPES).toHaveLength(14);
    });

    it('should contain all WebhookEventType enum values', () => {
      const enumValues = Object.values(WebhookEventType);
      expect(ALL_WEBHOOK_EVENT_TYPES).toEqual(expect.arrayContaining(enumValues));
      expect(enumValues).toEqual(expect.arrayContaining(ALL_WEBHOOK_EVENT_TYPES));
    });
  });

  describe('isValidWebhookEventType', () => {
    it('should return true for each valid event type', () => {
      for (const eventType of ALL_WEBHOOK_EVENT_TYPES) {
        expect(isValidWebhookEventType(eventType)).toBe(true);
      }
    });

    it('should return false for invalid event type', () => {
      expect(isValidWebhookEventType('invalid.event')).toBe(false);
      expect(isValidWebhookEventType('')).toBe(false);
      expect(isValidWebhookEventType('agent.task')).toBe(false);
    });

    it('should return true for agent.task.started', () => {
      expect(isValidWebhookEventType('agent.task.started')).toBe(true);
    });

    it('should return true for deployment.succeeded', () => {
      expect(isValidWebhookEventType('deployment.succeeded')).toBe(true);
    });

    it('should return true for cost.alert.exceeded', () => {
      expect(isValidWebhookEventType('cost.alert.exceeded')).toBe(true);
    });
  });

  describe('WEBHOOK_EVENT_CATEGORIES', () => {
    it('should cover all event types (no duplicates, no missing)', () => {
      const allCategoryEvents = WEBHOOK_EVENT_CATEGORIES.flatMap(
        (c) => c.events.map((e) => e.type),
      );
      const allEventTypes = Object.values(WebhookEventType);

      // No missing
      for (const eventType of allEventTypes) {
        expect(allCategoryEvents).toContain(eventType);
      }

      // No duplicates
      const uniqueEvents = new Set(allCategoryEvents);
      expect(uniqueEvents.size).toBe(allCategoryEvents.length);
    });

    it('should have 5 categories', () => {
      expect(WEBHOOK_EVENT_CATEGORIES).toHaveLength(5);
    });

    it('should have correct category names', () => {
      const names = WEBHOOK_EVENT_CATEGORIES.map((c) => c.name);
      expect(names).toContain('Agent Events');
      expect(names).toContain('Deployment Events');
      expect(names).toContain('Story Events');
      expect(names).toContain('Sprint Events');
      expect(names).toContain('Cost Events');
    });

    it('each category should have a name and at least one event', () => {
      for (const category of WEBHOOK_EVENT_CATEGORIES) {
        expect(category.name).toBeTruthy();
        expect(category.events.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('each event should have type, label, and description', () => {
      for (const category of WEBHOOK_EVENT_CATEGORIES) {
        for (const event of category.events) {
          expect(event.type).toBeTruthy();
          expect(event.label).toBeTruthy();
          expect(event.description).toBeTruthy();
        }
      }
    });
  });
});
