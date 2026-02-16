/**
 * EmailNotificationController Tests
 * Story 16.6: Production Email Service (AC8)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { EmailNotificationController } from '../controllers/email-notification.controller';
import { EmailNotificationService } from '../services/email-notification.service';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { EmailConfiguration } from '../../../database/entities/email-configuration.entity';
import { EmailBounce } from '../../../database/entities/email-bounce.entity';
import { EmailSendLog } from '../../../database/entities/email-send-log.entity';

describe('EmailNotificationController', () => {
  let controller: EmailNotificationController;
  let emailService: any;
  let configRepo: any;
  let bounceRepo: any;
  let sendLogRepo: any;
  let encryptionService: any;

  const mockConfig = {
    id: 'config-1',
    workspaceId: 'ws-1',
    provider: 'smtp',
    fromAddress: 'noreply@devos.app',
    fromName: 'DevOS',
    replyTo: 'support@devos.app',
    status: 'active',
    rateLimitPerHour: 100,
    totalSent: 10,
    totalBounced: 1,
    createdAt: new Date(),
  };

  const mockReq = { user: { sub: 'user-1' } };

  beforeEach(async () => {
    emailService = {
      getConfiguration: jest.fn().mockResolvedValue(mockConfig),
      testConfiguration: jest.fn().mockResolvedValue({ success: true }),
      clearBounce: jest.fn().mockResolvedValue(undefined),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    configRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'config-1', createdAt: new Date(), ...data })),
      create: jest.fn().mockImplementation((data) => data),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    bounceRepo = {
      findAndCount: jest.fn().mockResolvedValue([
        [
          { emailAddress: 'bounce@test.com', bounceType: 'hard', bouncedAt: new Date() },
        ],
        1,
      ]),
    };

    sendLogRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 'log-1',
              recipientEmail: 'test@example.com',
              template: 'welcome',
              subject: 'Welcome',
              status: 'sent',
              createdAt: new Date(),
            },
          ],
          1,
        ]),
      }),
    };

    encryptionService = {
      encrypt: jest.fn().mockReturnValue('encrypted-data'),
      decrypt: jest.fn().mockReturnValue('decrypted-data'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailNotificationController],
      providers: [
        { provide: EmailNotificationService, useValue: emailService },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: getRepositoryToken(EmailConfiguration), useValue: configRepo },
        { provide: getRepositoryToken(EmailBounce), useValue: bounceRepo },
        { provide: getRepositoryToken(EmailSendLog), useValue: sendLogRepo },
      ],
    }).compile();

    controller = module.get<EmailNotificationController>(EmailNotificationController);
  });

  describe('POST /configure', () => {
    it('should create email configuration for workspace', async () => {
      const body = {
        provider: 'smtp',
        smtpHost: 'smtp.test.com',
        smtpPort: 587,
        smtpUser: 'user',
        smtpPass: 'pass',
      };

      const result = await controller.configure('ws-1', body as any, mockReq);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('provider');
      expect(configRepo.save).toHaveBeenCalled();
    });

    it('should encrypt SMTP password', async () => {
      const body = {
        provider: 'smtp',
        smtpPass: 'my-secret-password',
      };

      await controller.configure('ws-1', body as any, mockReq);
      expect(encryptionService.encrypt).toHaveBeenCalledWith('my-secret-password');
    });

    it('should encrypt API key', async () => {
      const body = {
        provider: 'sendgrid',
        apiKey: 'SG.my-api-key',
      };

      await controller.configure('ws-1', body as any, mockReq);
      expect(encryptionService.encrypt).toHaveBeenCalledWith('SG.my-api-key');
    });

    it('should return 409 if configuration already exists', async () => {
      configRepo.findOne.mockResolvedValue(mockConfig);
      const body = { provider: 'smtp' };

      await expect(controller.configure('ws-1', body as any, mockReq))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('GET /status', () => {
    it('should return current configuration status (without sensitive fields)', async () => {
      const result = await controller.getStatus('ws-1');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('fromAddress');
      expect(result).toHaveProperty('status');
      // Should NOT have sensitive fields
      expect(result).not.toHaveProperty('smtpPass');
      expect(result).not.toHaveProperty('apiKey');
      expect(result).not.toHaveProperty('smtpPassIv');
      expect(result).not.toHaveProperty('apiKeyIv');
    });

    it('should return 404 if no configuration exists', async () => {
      emailService.getConfiguration.mockResolvedValue(null);
      await expect(controller.getStatus('ws-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('PUT /config', () => {
    it('should update only provided fields', async () => {
      configRepo.findOne
        .mockResolvedValueOnce(mockConfig) // First call: check existence
        .mockResolvedValueOnce({ ...mockConfig, fromName: 'NewName' }); // After update

      const body = { fromName: 'NewName' };
      const result = await controller.updateConfig('ws-1', body);
      expect(configRepo.update).toHaveBeenCalledWith(
        { workspaceId: 'ws-1' },
        expect.objectContaining({ fromName: 'NewName' }),
      );
    });

    it('should invalidate Redis cache', async () => {
      configRepo.findOne
        .mockResolvedValueOnce(mockConfig)
        .mockResolvedValueOnce(mockConfig);

      await controller.updateConfig('ws-1', { fromName: 'Test' });
      expect(emailService.invalidateCache).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('POST /test', () => {
    it('should send test email and return result', async () => {
      const result = await controller.testEmail('ws-1', { testEmail: 'test@example.com' });
      expect(result).toEqual({ success: true });
      expect(emailService.testConfiguration).toHaveBeenCalledWith('ws-1', 'test@example.com');
    });

    it('should return 400 if no configuration exists', async () => {
      emailService.getConfiguration.mockResolvedValue(null);
      await expect(controller.testEmail('ws-1', { testEmail: 'test@example.com' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('DELETE /', () => {
    it('should remove email configuration', async () => {
      await controller.removeConfiguration('ws-1');
      expect(configRepo.delete).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
    });

    it('should invalidate Redis cache', async () => {
      await controller.removeConfiguration('ws-1');
      expect(emailService.invalidateCache).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('GET /bounces', () => {
    it('should return paginated bounce list', async () => {
      const result = await controller.listBounces('ws-1', 1, 20);
      expect(result).toHaveProperty('bounces');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result.bounces.length).toBe(1);
      expect(result.bounces[0]).toHaveProperty('emailAddress');
    });
  });

  describe('DELETE /bounces/:emailAddress', () => {
    it('should clear bounce', async () => {
      await controller.clearBounce('ws-1', 'test@example.com');
      expect(emailService.clearBounce).toHaveBeenCalledWith('ws-1', 'test@example.com');
    });
  });

  describe('GET /logs', () => {
    it('should return paginated send logs with filtering', async () => {
      const result = await controller.listSendLogs('ws-1', 1, 20, 'welcome', 'sent');
      expect(result).toHaveProperty('logs');
      expect(result).toHaveProperty('total');
      expect(result.logs.length).toBe(1);
      expect(result.logs[0]).toHaveProperty('id');
      expect(result.logs[0]).toHaveProperty('recipientEmail');
      expect(result.logs[0]).toHaveProperty('template');
    });
  });

  describe('authentication', () => {
    it('should have JwtAuthGuard on all endpoints', () => {
      // Verify guards are applied via metadata
      const configureGuards = Reflect.getMetadata('__guards__', EmailNotificationController.prototype.configure);
      const statusGuards = Reflect.getMetadata('__guards__', EmailNotificationController.prototype.getStatus);
      const updateGuards = Reflect.getMetadata('__guards__', EmailNotificationController.prototype.updateConfig);
      const testGuards = Reflect.getMetadata('__guards__', EmailNotificationController.prototype.testEmail);
      const removeGuards = Reflect.getMetadata('__guards__', EmailNotificationController.prototype.removeConfiguration);
      const bouncesGuards = Reflect.getMetadata('__guards__', EmailNotificationController.prototype.listBounces);
      const clearBounceGuards = Reflect.getMetadata('__guards__', EmailNotificationController.prototype.clearBounce);
      const logsGuards = Reflect.getMetadata('__guards__', EmailNotificationController.prototype.listSendLogs);

      // All should have at least one guard
      expect(configureGuards).toBeDefined();
      expect(statusGuards).toBeDefined();
      expect(updateGuards).toBeDefined();
      expect(testGuards).toBeDefined();
      expect(removeGuards).toBeDefined();
      expect(bouncesGuards).toBeDefined();
      expect(clearBounceGuards).toBeDefined();
      expect(logsGuards).toBeDefined();
    });
  });
});
