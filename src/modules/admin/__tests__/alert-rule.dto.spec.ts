import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateAlertRuleDto,
  UpdateAlertRuleDto,
  AlertHistoryQueryDto,
  SilenceAlertDto,
  ResolveAlertDto,
} from '../dto/alert-rule.dto';

describe('Alert Rule DTOs', () => {
  describe('CreateAlertRuleDto', () => {
    const validData = {
      name: 'Test Rule',
      ruleType: 'threshold',
      condition: 'metric.error_rate',
      operator: 'gt',
      threshold: '5',
      severity: 'warning',
      channels: ['in_app'],
    };

    it('should validate required fields', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, validData);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid ruleType', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, {
        ...validData,
        ruleType: 'invalid',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid operator', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, {
        ...validData,
        operator: 'invalid',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid severity', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, {
        ...validData,
        severity: 'invalid',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept valid metadata object', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, {
        ...validData,
        metadata: { webhookUrl: 'https://test.com' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject missing name', async () => {
      const { name, ...dataWithoutName } = validData;
      const dto = plainToInstance(CreateAlertRuleDto, dataWithoutName);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty channels array', async () => {
      const dto = plainToInstance(CreateAlertRuleDto, {
        ...validData,
        channels: 'not_array',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('AlertHistoryQueryDto', () => {
    it('should have default page 1 and limit 50', () => {
      const dto = new AlertHistoryQueryDto();
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(50);
    });

    it('should reject limit > 100', async () => {
      const dto = plainToInstance(AlertHistoryQueryDto, { limit: 200 });
      const errors = await validate(dto);
      const limitError = errors.find((e) => e.property === 'limit');
      expect(limitError).toBeDefined();
    });

    it('should accept valid severity filter', async () => {
      const dto = plainToInstance(AlertHistoryQueryDto, {
        severity: 'critical',
      });
      const errors = await validate(dto);
      const severityError = errors.find((e) => e.property === 'severity');
      expect(severityError).toBeUndefined();
    });

    it('should accept valid status filter', async () => {
      const dto = plainToInstance(AlertHistoryQueryDto, {
        status: 'fired',
      });
      const errors = await validate(dto);
      const statusError = errors.find((e) => e.property === 'status');
      expect(statusError).toBeUndefined();
    });
  });

  describe('SilenceAlertDto', () => {
    it('should require durationMinutes between 1 and 1440', async () => {
      const valid = plainToInstance(SilenceAlertDto, { durationMinutes: 60 });
      const validErrors = await validate(valid);
      expect(validErrors.length).toBe(0);

      const tooLow = plainToInstance(SilenceAlertDto, { durationMinutes: 0 });
      const lowErrors = await validate(tooLow);
      expect(lowErrors.length).toBeGreaterThan(0);

      const tooHigh = plainToInstance(SilenceAlertDto, { durationMinutes: 2000 });
      const highErrors = await validate(tooHigh);
      expect(highErrors.length).toBeGreaterThan(0);
    });
  });

  describe('ResolveAlertDto', () => {
    it('should accept optional note up to 1000 chars', async () => {
      const dto = plainToInstance(ResolveAlertDto, {
        note: 'Fixed the issue',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty body (all optional)', async () => {
      const dto = plainToInstance(ResolveAlertDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject note longer than 1000 chars', async () => {
      const dto = plainToInstance(ResolveAlertDto, {
        note: 'x'.repeat(1001),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
