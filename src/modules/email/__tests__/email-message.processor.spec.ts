/**
 * EmailMessageProcessor Tests
 * Story 16.6: Production Email Service (AC7)
 */

import { EmailMessageProcessor } from '../processors/email-message.processor';
import { EmailNotificationService } from '../services/email-notification.service';
import { EmailTemplate } from '../services/email-template.service';
import { NotificationEvent } from '../../notifications/events/notification.events';

describe('EmailMessageProcessor', () => {
  let processor: EmailMessageProcessor;
  let emailService: jest.Mocked<EmailNotificationService>;

  const mockNotification: NotificationEvent = {
    type: 'story_completed',
    payload: { storyId: 's1', storyTitle: 'Test Story' },
    recipients: [{ userId: 'user-1', workspaceId: 'ws-1' }],
    urgency: 'normal',
    batchable: true,
  };

  beforeEach(() => {
    emailService = {
      sendNotification: jest.fn().mockResolvedValue({ sent: true, messageId: 'msg-1' }),
      sendTransactional: jest.fn().mockResolvedValue({ sent: true, messageId: 'msg-2' }),
    } as any;

    processor = new EmailMessageProcessor(emailService);
  });

  describe('handleSendNotification()', () => {
    it('should call emailService.sendNotification() with correct args', async () => {
      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          recipientEmail: 'test@example.com',
          attempt: 1,
        },
      } as any;

      await processor.handleSendNotification(job);

      expect(emailService.sendNotification).toHaveBeenCalledWith(
        'ws-1',
        mockNotification,
        'test@example.com',
      );
    });

    it('should throw on failure when attempt < 3 (triggers retry)', async () => {
      emailService.sendNotification.mockResolvedValue({ sent: false, error: 'Rate limited' });

      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          recipientEmail: 'test@example.com',
          attempt: 1,
        },
      } as any;

      await expect(processor.handleSendNotification(job)).rejects.toThrow('Rate limited');
    });

    it('should log warning and complete on final attempt failure', async () => {
      emailService.sendNotification.mockResolvedValue({ sent: false, error: 'Final failure' });

      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          recipientEmail: 'test@example.com',
          attempt: 3,
        },
      } as any;

      // Should NOT throw - just logs and completes
      await expect(processor.handleSendNotification(job)).resolves.not.toThrow();
    });
  });

  describe('handleSendTransactional()', () => {
    it('should call emailService.sendTransactional() with correct args', async () => {
      const job = {
        data: {
          to: 'user@example.com',
          template: EmailTemplate.WELCOME,
          data: { userName: 'Test' },
          attempt: 1,
        },
      } as any;

      await processor.handleSendTransactional(job);

      expect(emailService.sendTransactional).toHaveBeenCalledWith(
        'user@example.com',
        EmailTemplate.WELCOME,
        { userName: 'Test' },
      );
    });

    it('should retry on failure up to 3 attempts', async () => {
      emailService.sendTransactional.mockResolvedValue({ sent: false, error: 'SMTP error' });

      const job = {
        data: {
          to: 'user@example.com',
          template: EmailTemplate.WELCOME,
          data: {},
          attempt: 2,
        },
      } as any;

      await expect(processor.handleSendTransactional(job)).rejects.toThrow('SMTP error');
    });

    it('should not throw on final attempt failure', async () => {
      emailService.sendTransactional.mockResolvedValue({ sent: false, error: 'Final error' });

      const job = {
        data: {
          to: 'user@example.com',
          template: EmailTemplate.WELCOME,
          data: {},
          attempt: 3,
        },
      } as any;

      await expect(processor.handleSendTransactional(job)).resolves.not.toThrow();
    });
  });

  describe('handleSendBulk()', () => {
    it('should call emailService.sendTransactional() for the job', async () => {
      const job = {
        data: {
          workspaceId: 'ws-1',
          recipientEmail: 'bulk@example.com',
          template: EmailTemplate.WEEKLY_SUMMARY,
          data: { workspaceName: 'Test' },
          attempt: 1,
        },
      } as any;

      await processor.handleSendBulk(job);

      expect(emailService.sendTransactional).toHaveBeenCalledWith(
        'bulk@example.com',
        EmailTemplate.WEEKLY_SUMMARY,
        { workspaceName: 'Test' },
      );
    });

    it('should throw on failure when attempt < 3', async () => {
      emailService.sendTransactional.mockResolvedValue({ sent: false, error: 'Error' });

      const job = {
        data: {
          workspaceId: 'ws-1',
          recipientEmail: 'bulk@example.com',
          template: EmailTemplate.WEEKLY_SUMMARY,
          data: {},
          attempt: 1,
        },
      } as any;

      await expect(processor.handleSendBulk(job)).rejects.toThrow();
    });
  });

  describe('job data structure', () => {
    it('should match expected structure for send-notification', async () => {
      const job = {
        data: {
          workspaceId: 'ws-1',
          notification: mockNotification,
          recipientEmail: 'test@example.com',
          attempt: 1,
        },
      } as any;

      expect(job.data).toHaveProperty('workspaceId');
      expect(job.data).toHaveProperty('notification');
      expect(job.data).toHaveProperty('recipientEmail');
      expect(job.data).toHaveProperty('attempt');
      expect(typeof job.data.attempt).toBe('number');

      await processor.handleSendNotification(job);
    });

    it('should match expected structure for send-transactional', async () => {
      const job = {
        data: {
          to: 'test@example.com',
          template: EmailTemplate.WELCOME,
          data: {},
          attempt: 1,
        },
      } as any;

      expect(job.data).toHaveProperty('to');
      expect(job.data).toHaveProperty('template');
      expect(job.data).toHaveProperty('data');
      expect(job.data).toHaveProperty('attempt');

      await processor.handleSendTransactional(job);
    });
  });
});
