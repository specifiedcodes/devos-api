/**
 * Webhook DTO Tests
 * Story 21-8: Webhook Management (AC5)
 */

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateWebhookDto,
  UpdateWebhookDto,
  DeliveryLogQueryDto,
  TestWebhookDto,
} from '../dto/webhook.dto';

describe('WebhookDTOs', () => {
  describe('CreateWebhookDto', () => {
    it('should reject empty name', async () => {
      const dto = plainToInstance(CreateWebhookDto, {
        name: '',
        url: 'https://example.com/webhook',
        events: ['agent.task.started'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });

    it('should reject HTTP URL', async () => {
      const dto = plainToInstance(CreateWebhookDto, {
        name: 'Test',
        url: 'http://example.com/webhook',
        events: ['agent.task.started'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'url')).toBe(true);
    });

    it('should accept HTTPS URL', async () => {
      const dto = plainToInstance(CreateWebhookDto, {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['agent.task.started'],
      });
      const errors = await validate(dto);
      const urlErrors = errors.filter((e) => e.property === 'url');
      expect(urlErrors).toHaveLength(0);
    });

    it('should reject events array with more than 20 items', async () => {
      const events = Array.from({ length: 21 }, (_, i) => `event.${i}`);
      const dto = plainToInstance(CreateWebhookDto, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'events')).toBe(true);
    });

    it('should accept valid create webhook input', async () => {
      const dto = plainToInstance(CreateWebhookDto, {
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['agent.task.started', 'agent.task.completed'],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept headers as optional', async () => {
      const dto = plainToInstance(CreateWebhookDto, {
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['agent.task.started'],
        headers: { 'Authorization': 'Bearer token' },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject name longer than 255 characters', async () => {
      const dto = plainToInstance(CreateWebhookDto, {
        name: 'a'.repeat(256),
        url: 'https://example.com/webhook',
        events: ['agent.task.started'],
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });
  });

  describe('UpdateWebhookDto', () => {
    it('should allow partial updates (all fields optional)', async () => {
      const dto = plainToInstance(UpdateWebhookDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject HTTP URL when provided', async () => {
      const dto = plainToInstance(UpdateWebhookDto, {
        url: 'http://example.com/webhook',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'url')).toBe(true);
    });

    it('should accept valid partial update', async () => {
      const dto = plainToInstance(UpdateWebhookDto, {
        name: 'Updated Name',
        isActive: false,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept events update', async () => {
      const dto = plainToInstance(UpdateWebhookDto, {
        events: ['deployment.started', 'deployment.failed'],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('DeliveryLogQueryDto', () => {
    it('should allow all fields to be undefined (defaults to service defaults)', async () => {
      const dto = plainToInstance(DeliveryLogQueryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject limit > 100', async () => {
      const dto = plainToInstance(DeliveryLogQueryDto, { limit: 101 });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });

    it('should reject negative offset', async () => {
      const dto = plainToInstance(DeliveryLogQueryDto, { offset: -1 });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'offset')).toBe(true);
    });

    it('should accept valid pagination params', async () => {
      const dto = plainToInstance(DeliveryLogQueryDto, {
        limit: 50,
        offset: 10,
        status: 'failed',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject limit < 1', async () => {
      const dto = plainToInstance(DeliveryLogQueryDto, { limit: 0 });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });
  });

  describe('TestWebhookDto', () => {
    it('should accept optional eventType', async () => {
      const dto = plainToInstance(TestWebhookDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid eventType', async () => {
      const dto = plainToInstance(TestWebhookDto, {
        eventType: 'agent.task.started',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
