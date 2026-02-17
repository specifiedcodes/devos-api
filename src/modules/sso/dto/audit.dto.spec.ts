import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ListAuditEventsQueryDto,
  ExportAuditEventsQueryDto,
  ComplianceReportQueryDto,
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
  CreateWebhookDto,
  UpdateWebhookDto,
  NotificationChannelDto,
} from './audit.dto';

describe('Audit DTOs', () => {
  describe('ListAuditEventsQueryDto', () => {
    it('should accept valid parameters', async () => {
      const dto = plainToInstance(ListAuditEventsQueryDto, {
        eventType: 'saml_login_success',
        actorId: '550e8400-e29b-41d4-a716-446655440000',
        page: 1,
        limit: 50,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty parameters', async () => {
      const dto = plainToInstance(ListAuditEventsQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid page', async () => {
      const dto = plainToInstance(ListAuditEventsQueryDto, { page: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject limit over 200', async () => {
      const dto = plainToInstance(ListAuditEventsQueryDto, { limit: 201 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept dateFrom and dateTo', async () => {
      const dto = plainToInstance(ListAuditEventsQueryDto, {
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-02-01T00:00:00.000Z',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid date string', async () => {
      const dto = plainToInstance(ListAuditEventsQueryDto, {
        dateFrom: 'not-a-date',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ExportAuditEventsQueryDto', () => {
    it('should require format', async () => {
      const dto = plainToInstance(ExportAuditEventsQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept csv format', async () => {
      const dto = plainToInstance(ExportAuditEventsQueryDto, { format: 'csv' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept json format', async () => {
      const dto = plainToInstance(ExportAuditEventsQueryDto, { format: 'json' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid format', async () => {
      const dto = plainToInstance(ExportAuditEventsQueryDto, { format: 'xml' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ComplianceReportQueryDto', () => {
    it('should accept ISO 8601 date strings', async () => {
      const dto = plainToInstance(ComplianceReportQueryDto, {
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-02-01T00:00:00.000Z',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty parameters', async () => {
      const dto = plainToInstance(ComplianceReportQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('CreateAlertRuleDto', () => {
    const validDto = {
      name: 'Test Alert',
      eventTypes: ['saml_login_failure'],
      notificationChannels: [{ type: 'email', target: 'admin@test.com' }],
    };

    it('should accept valid parameters', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, validDto);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should require name', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, name: undefined });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'name')).toBe(true);
    });

    it('should require eventTypes', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, eventTypes: undefined });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'eventTypes')).toBe(true);
    });

    it('should require notificationChannels', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, notificationChannels: undefined });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'notificationChannels')).toBe(true);
    });

    it('should reject threshold less than 1', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, threshold: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject threshold greater than 1000', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, threshold: 1001 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject windowMinutes less than 1', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, windowMinutes: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject windowMinutes greater than 1440', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, windowMinutes: 1441 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject more than 20 event types', async () => {
      const manyTypes = Array.from({ length: 21 }, (_, i) => `event_${i}`);
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, eventTypes: manyTypes });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject more than 10 notification channels', async () => {
      const manyChannels = Array.from({ length: 11 }, (_, i) => ({ type: 'email', target: `user${i}@test.com` }));
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, notificationChannels: manyChannels });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept optional description', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, { ...validDto, description: 'Test description' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('UpdateAlertRuleDto', () => {
    it('should accept partial updates', async () => {
      const dto = plainToInstance(UpdateAlertRuleDto, { name: 'Updated Name' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty body', async () => {
      const dto = plainToInstance(UpdateAlertRuleDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept isActive boolean', async () => {
      const dto = plainToInstance(UpdateAlertRuleDto, { isActive: false });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('CreateWebhookDto', () => {
    const validDto = {
      name: 'Splunk SIEM',
      url: 'https://siem.acme.com/api/events',
    };

    it('should accept valid parameters', async () => {
      const dto = plainToInstance(CreateWebhookDto, validDto);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should require name', async () => {
      const dto = plainToInstance(CreateWebhookDto, { url: validDto.url });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'name')).toBe(true);
    });

    it('should require url', async () => {
      const dto = plainToInstance(CreateWebhookDto, { name: validDto.name });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'url')).toBe(true);
    });

    it('should reject non-HTTPS url', async () => {
      const dto = plainToInstance(CreateWebhookDto, { ...validDto, url: 'http://siem.acme.com/api/events' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject retryCount greater than 10', async () => {
      const dto = plainToInstance(CreateWebhookDto, { ...validDto, retryCount: 11 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject timeoutMs greater than 30000', async () => {
      const dto = plainToInstance(CreateWebhookDto, { ...validDto, timeoutMs: 30001 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject timeoutMs less than 1000', async () => {
      const dto = plainToInstance(CreateWebhookDto, { ...validDto, timeoutMs: 999 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept optional secret', async () => {
      const dto = plainToInstance(CreateWebhookDto, { ...validDto, secret: 'my-secret' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('UpdateWebhookDto', () => {
    it('should accept partial updates', async () => {
      const dto = plainToInstance(UpdateWebhookDto, { name: 'Updated Name' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty body', async () => {
      const dto = plainToInstance(UpdateWebhookDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept isActive boolean', async () => {
      const dto = plainToInstance(UpdateWebhookDto, { isActive: false });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('NotificationChannelDto', () => {
    it('should require type and target', async () => {
      const dto = plainToInstance(NotificationChannelDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid type and target', async () => {
      const dto = plainToInstance(NotificationChannelDto, { type: 'email', target: 'admin@test.com' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});
