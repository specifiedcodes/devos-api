/**
 * Email Notification DTO Tests
 * Story 16.6: Production Email Service (AC9)
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ConfigureEmailDto,
  UpdateEmailConfigDto,
  TestEmailDto,
  EmailConfigurationStatusDto,
} from '../dto/email-notification.dto';

describe('Email DTOs', () => {
  describe('ConfigureEmailDto', () => {
    it('should validate provider enum (smtp, sendgrid, ses)', async () => {
      for (const provider of ['smtp', 'sendgrid', 'ses']) {
        const dto = plainToInstance(ConfigureEmailDto, { provider });
        const errors = await validate(dto);
        const providerErrors = errors.filter(e => e.property === 'provider');
        expect(providerErrors).toHaveLength(0);
      }
    });

    it('should reject invalid provider values', async () => {
      const dto = plainToInstance(ConfigureEmailDto, { provider: 'mailgun' });
      const errors = await validate(dto);
      const providerErrors = errors.filter(e => e.property === 'provider');
      expect(providerErrors.length).toBeGreaterThan(0);
    });

    it('should validate email format for fromAddress', async () => {
      const dto = plainToInstance(ConfigureEmailDto, {
        provider: 'smtp',
        fromAddress: 'not-an-email',
      });
      const errors = await validate(dto);
      const emailErrors = errors.filter(e => e.property === 'fromAddress');
      expect(emailErrors.length).toBeGreaterThan(0);
    });

    it('should accept valid email for fromAddress', async () => {
      const dto = plainToInstance(ConfigureEmailDto, {
        provider: 'smtp',
        fromAddress: 'noreply@devos.app',
      });
      const errors = await validate(dto);
      const emailErrors = errors.filter(e => e.property === 'fromAddress');
      expect(emailErrors).toHaveLength(0);
    });

    it('should validate email format for replyTo', async () => {
      const dto = plainToInstance(ConfigureEmailDto, {
        provider: 'smtp',
        replyTo: 'invalid-email',
      });
      const errors = await validate(dto);
      const emailErrors = errors.filter(e => e.property === 'replyTo');
      expect(emailErrors.length).toBeGreaterThan(0);
    });

    it('should accept all fields as optional except provider', async () => {
      const dto = plainToInstance(ConfigureEmailDto, { provider: 'smtp' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('UpdateEmailConfigDto', () => {
    it('should accept partial updates (all fields optional)', async () => {
      const dto = plainToInstance(UpdateEmailConfigDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate rateLimitPerHour is between 1 and 10000', async () => {
      const tooLow = plainToInstance(UpdateEmailConfigDto, { rateLimitPerHour: 0 });
      const lowErrors = await validate(tooLow);
      expect(lowErrors.filter(e => e.property === 'rateLimitPerHour').length).toBeGreaterThan(0);

      const tooHigh = plainToInstance(UpdateEmailConfigDto, { rateLimitPerHour: 100000 });
      const highErrors = await validate(tooHigh);
      expect(highErrors.filter(e => e.property === 'rateLimitPerHour').length).toBeGreaterThan(0);

      const valid = plainToInstance(UpdateEmailConfigDto, { rateLimitPerHour: 500 });
      const validErrors = await validate(valid);
      expect(validErrors.filter(e => e.property === 'rateLimitPerHour')).toHaveLength(0);
    });

    it('should validate fromAddress as email', async () => {
      const dto = plainToInstance(UpdateEmailConfigDto, { fromAddress: 'not-email' });
      const errors = await validate(dto);
      expect(errors.filter(e => e.property === 'fromAddress').length).toBeGreaterThan(0);
    });
  });

  describe('TestEmailDto', () => {
    it('should require valid email address', async () => {
      const invalid = plainToInstance(TestEmailDto, { testEmail: 'not-email' });
      const errors = await validate(invalid);
      expect(errors.length).toBeGreaterThan(0);

      const valid = plainToInstance(TestEmailDto, { testEmail: 'test@example.com' });
      const validErrors = await validate(valid);
      expect(validErrors.length).toBe(0);
    });

    it('should reject missing email', async () => {
      const dto = plainToInstance(TestEmailDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('EmailConfigurationStatusDto', () => {
    it('should NOT include sensitive fields (no passwords, no API keys)', () => {
      const dto = new EmailConfigurationStatusDto();
      const properties = Object.getOwnPropertyNames(dto);
      // These should never be on the status DTO
      expect(properties).not.toContain('smtpPass');
      expect(properties).not.toContain('apiKey');
      expect(properties).not.toContain('smtpPassIv');
      expect(properties).not.toContain('apiKeyIv');
    });
  });
});
