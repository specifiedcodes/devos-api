/**
 * EmailNotificationService
 * Story 16.6: Production Email Service (AC6)
 *
 * Core service for sending email notifications with rate limiting,
 * bounce handling, template rendering, and provider abstraction.
 * Uses nodemailer for all providers (SMTP, SendGrid via SMTP, SES via SMTP).
 * Follows Slack/Discord patterns for rate limiting and error handling.
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { EmailConfiguration } from '../../../database/entities/email-configuration.entity';
import { EmailBounce } from '../../../database/entities/email-bounce.entity';
import { EmailSendLog } from '../../../database/entities/email-send-log.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { RedisService } from '../../redis/redis.service';
import { EmailTemplateService, EmailTemplate } from './email-template.service';
import { NotificationEvent, NotificationType } from '../../notifications/events/notification.events';

const RATE_LIMIT_PREFIX = 'email-rl:';
const USER_RATE_LIMIT_PREFIX = 'email-rl:user:';
const CACHE_PREFIX = 'email-config:';
const CACHE_TTL = 300; // 5 minutes
export const EMAIL_NOTIFICATIONS_QUEUE = 'email-notifications';

/**
 * Map notification types to email templates
 */
const NOTIFICATION_TYPE_TO_TEMPLATE: Partial<Record<NotificationType, EmailTemplate>> = {
  story_completed: EmailTemplate.STORY_COMPLETED,
  epic_completed: EmailTemplate.EPIC_COMPLETED,
  deployment_success: EmailTemplate.DEPLOYMENT_SUCCESS,
  deployment_failed: EmailTemplate.DEPLOYMENT_FAILED,
  agent_error: EmailTemplate.AGENT_ERROR,
};

@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);
  private readonly transporterCache = new Map<string, Transporter>();
  private globalTransporter: Transporter | null = null;

  constructor(
    @InjectRepository(EmailConfiguration)
    private readonly emailConfigRepo: Repository<EmailConfiguration>,
    @InjectRepository(EmailBounce)
    private readonly emailBounceRepo: Repository<EmailBounce>,
    @InjectRepository(EmailSendLog)
    private readonly emailSendLogRepo: Repository<EmailSendLog>,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
    private readonly templateService: EmailTemplateService,
    @Optional() @InjectQueue(EMAIL_NOTIFICATIONS_QUEUE)
    private readonly emailQueue?: Queue,
  ) {
    this.initGlobalTransporter();
  }

  /**
   * Initialize global SMTP transporter for system-level emails.
   */
  private initGlobalTransporter(): void {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && user) {
      try {
        this.globalTransporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        this.logger.log(`Global email transporter initialized: ${host}:${port}`);
      } catch (error) {
        this.logger.warn('Failed to initialize global email transporter');
      }
    } else {
      this.logger.log('Global SMTP not configured. System emails will be logged only.');
    }
  }

  /**
   * Send a notification email for a workspace.
   * Checks bounce list, rate limits, renders template, sends via configured provider.
   */
  async sendNotification(
    workspaceId: string,
    notification: NotificationEvent,
    recipientEmail: string,
  ): Promise<{ sent: boolean; messageId?: string; error?: string }> {
    // Get workspace email config
    const config = await this.getConfiguration(workspaceId);
    if (!config) {
      return { sent: false, error: 'No email configuration found for workspace' };
    }

    if (config.status !== 'active') {
      return { sent: false, error: `Email configuration status is ${config.status}` };
    }

    // Check bounce list
    const bounced = await this.isBounced(workspaceId, recipientEmail);
    if (bounced) {
      return { sent: false, error: 'Recipient is on bounce list' };
    }

    // Check workspace rate limit
    const rateLimited = await this.isRateLimited(workspaceId, config.rateLimitPerHour);
    if (rateLimited) {
      this.logger.warn(`Email rate limit exceeded for workspace ${workspaceId}`);
      return { sent: false, error: 'Rate limit exceeded' };
    }

    // Resolve template from notification type
    const template = NOTIFICATION_TYPE_TO_TEMPLATE[notification.type];
    if (!template) {
      return { sent: false, error: `No email template for notification type: ${notification.type}` };
    }

    // Render template
    const rendered = this.templateService.render(template, notification.payload);

    // Create send log entry
    const sendLog = this.emailSendLogRepo.create({
      workspaceId,
      recipientEmail,
      template,
      subject: rendered.subject,
      status: 'queued',
    });
    await this.emailSendLogRepo.save(sendLog);

    // Get transporter
    let transporter: Transporter;
    try {
      transporter = await this.getWorkspaceTransporter(config);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.emailSendLogRepo.update({ id: sendLog.id }, { status: 'failed', errorMessage: errorMsg });
      await this.recordError(config, errorMsg);
      return { sent: false, error: errorMsg };
    }

    // Send email
    try {
      const info = await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromAddress}>`,
        to: recipientEmail,
        replyTo: config.replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      // Update send log
      await this.emailSendLogRepo.update(
        { id: sendLog.id },
        { status: 'sent', messageId: info.messageId, sentAt: new Date() },
      );

      // Record success
      await this.recordSuccess(workspaceId, config);

      return { sent: true, messageId: info.messageId };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email to ${recipientEmail}: ${errorMsg}`);

      await this.emailSendLogRepo.update(
        { id: sendLog.id },
        { status: 'failed', errorMessage: errorMsg },
      );
      await this.recordError(config, errorMsg);

      return { sent: false, error: errorMsg };
    }
  }

  /**
   * Send a transactional email (e.g., password reset, welcome).
   * Uses global SMTP config (not workspace-specific).
   */
  async sendTransactional(
    to: string,
    template: EmailTemplate,
    data: Record<string, any>,
  ): Promise<{ sent: boolean; messageId?: string; error?: string }> {
    const rendered = this.templateService.render(template, data);

    if (!this.globalTransporter) {
      this.logger.log(`[EMAIL STUB] To: ${to} | Subject: ${rendered.subject} | Template: ${template}`);
      return { sent: false, error: 'Global SMTP not configured' };
    }

    try {
      const from = this.configService.get<string>('SMTP_FROM', '"DevOS" <noreply@devos.app>');

      const info = await this.globalTransporter.sendMail({
        from,
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      this.logger.log(`Transactional email sent: ${info.messageId} to ${to}`);
      return { sent: true, messageId: info.messageId };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send transactional email to ${to}: ${errorMsg}`);
      return { sent: false, error: errorMsg };
    }
  }

  /**
   * Send bulk emails to multiple recipients.
   * Queues each via BullMQ to prevent spikes.
   */
  async sendBulk(
    workspaceId: string,
    recipients: string[],
    template: EmailTemplate,
    data: Record<string, any>,
  ): Promise<{ queued: number; skippedBounced: number }> {
    let queued = 0;
    let skippedBounced = 0;

    for (const email of recipients) {
      const bounced = await this.isBounced(workspaceId, email);
      if (bounced) {
        skippedBounced++;
        continue;
      }

      if (this.emailQueue) {
        await this.emailQueue.add('send-bulk', {
          workspaceId,
          recipientEmail: email,
          template,
          data,
          attempt: 1,
        });
      }
      queued++;
    }

    return { queued, skippedBounced };
  }

  /**
   * Check if an email address is on the bounce list.
   */
  async isBounced(workspaceId: string, email: string): Promise<boolean> {
    const bounce = await this.emailBounceRepo.findOne({
      where: { workspaceId, emailAddress: email },
    });

    if (!bounce) return false;

    // Hard bounces and complaints permanently block
    if (bounce.bounceType === 'hard' || bounce.bounceType === 'complaint') {
      return true;
    }

    // Soft bounces: allow retry after 24 hours
    if (bounce.bounceType === 'soft') {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return bounce.bouncedAt > twentyFourHoursAgo;
    }

    return false;
  }

  /**
   * Record a bounce for an email address (upsert).
   */
  async recordBounce(
    workspaceId: string,
    email: string,
    bounceType: 'hard' | 'soft' | 'complaint',
    reason?: string,
    template?: string,
  ): Promise<void> {
    // Upsert: update existing or create new
    const existing = await this.emailBounceRepo.findOne({
      where: { workspaceId, emailAddress: email },
    });

    if (existing) {
      await this.emailBounceRepo.update(
        { id: existing.id },
        {
          bounceType,
          bounceReason: reason,
          originalTemplate: template,
          bouncedAt: new Date(),
        },
      );
    } else {
      const bounce = this.emailBounceRepo.create({
        workspaceId,
        emailAddress: email,
        bounceType,
        bounceReason: reason,
        originalTemplate: template,
        bouncedAt: new Date(),
      });
      await this.emailBounceRepo.save(bounce);
    }

    // Update configuration stats
    if (bounceType === 'complaint') {
      await this.emailConfigRepo
        .createQueryBuilder()
        .update(EmailConfiguration)
        .set({ totalComplaints: () => 'total_complaints + 1' })
        .where('workspace_id = :workspaceId', { workspaceId })
        .execute();
    } else {
      await this.emailConfigRepo
        .createQueryBuilder()
        .update(EmailConfiguration)
        .set({ totalBounced: () => 'total_bounced + 1' })
        .where('workspace_id = :workspaceId', { workspaceId })
        .execute();
    }
  }

  /**
   * Remove an email from the bounce list (re-enable delivery).
   */
  async clearBounce(workspaceId: string, email: string): Promise<void> {
    await this.emailBounceRepo.delete({ workspaceId, emailAddress: email });
  }

  /**
   * Get email configuration for a workspace (cached).
   */
  async getConfiguration(workspaceId: string): Promise<EmailConfiguration | null> {
    // Try cache first
    const cached = await this.redisService.get(`${CACHE_PREFIX}${workspaceId}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Cache corrupted, fetch from DB
      }
    }

    const config = await this.emailConfigRepo.findOne({
      where: { workspaceId },
    });

    if (config) {
      await this.redisService.set(
        `${CACHE_PREFIX}${workspaceId}`,
        JSON.stringify(config),
        CACHE_TTL,
      );
    }

    return config;
  }

  /**
   * Invalidate configuration cache for a workspace.
   */
  async invalidateCache(workspaceId: string): Promise<void> {
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);
    this.transporterCache.delete(workspaceId);
  }

  /**
   * Test email configuration by sending a test email.
   */
  async testConfiguration(
    workspaceId: string,
    testEmail: string,
  ): Promise<{ success: boolean; error?: string }> {
    const config = await this.getConfiguration(workspaceId);
    if (!config) {
      return { success: false, error: 'No email configuration found' };
    }

    try {
      const transporter = await this.getWorkspaceTransporter(config);
      const rendered = this.templateService.render(EmailTemplate.TEST_EMAIL, {});

      await transporter.sendMail({
        from: `"${config.fromName}" <${config.fromAddress}>`,
        to: testEmail,
        replyTo: config.replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Get or create a nodemailer transporter for a workspace config.
   * Transporters are cached per workspace.
   */
  private async getWorkspaceTransporter(config: EmailConfiguration): Promise<Transporter> {
    const cached = this.transporterCache.get(config.workspaceId);
    if (cached) return cached;

    let transportConfig: nodemailer.TransportOptions;

    switch (config.provider) {
      case 'sendgrid': {
        const apiKey = config.apiKey ? this.encryptionService.decrypt(config.apiKey) : '';
        transportConfig = {
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: { user: 'apikey', pass: apiKey },
        } as any;
        break;
      }
      case 'ses': {
        const apiKey = config.apiKey ? this.encryptionService.decrypt(config.apiKey) : '';
        const region = config.smtpHost || 'us-east-1';
        transportConfig = {
          host: `email-smtp.${region}.amazonaws.com`,
          port: 587,
          secure: false,
          auth: { user: config.smtpUser || '', pass: apiKey },
        } as any;
        break;
      }
      case 'smtp':
      default: {
        const smtpPass = config.smtpPass ? this.encryptionService.decrypt(config.smtpPass) : '';
        transportConfig = {
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpPort === 465,
          auth: { user: config.smtpUser || '', pass: smtpPass },
        } as any;
        break;
      }
    }

    const transporter = nodemailer.createTransport(transportConfig);
    this.transporterCache.set(config.workspaceId, transporter);
    return transporter;
  }

  /**
   * Check rate limit using Redis sorted set (follows Slack/Discord pattern).
   */
  private async isRateLimited(workspaceId: string, limitPerHour: number): Promise<boolean> {
    const key = `${RATE_LIMIT_PREFIX}${workspaceId}`;
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    // Prune old entries
    await this.redisService.zremrangebyscore(key, 0, oneHourAgo);
    await this.redisService.expire(key, 3600);

    // Count entries in the last hour
    const entries = await this.redisService.zrangebyscore(key, oneHourAgo, now);

    return entries.length >= limitPerHour;
  }

  /**
   * Record successful send in rate limiter and update stats.
   */
  private async recordSuccess(workspaceId: string, config: EmailConfiguration): Promise<void> {
    const key = `${RATE_LIMIT_PREFIX}${workspaceId}`;
    const now = Date.now();

    // Add to rate limit sorted set
    await this.redisService.zadd(key, now, `${now}`);
    await this.redisService.expire(key, 3600);

    // Atomically update stats and increment total_sent in a single query
    await this.emailConfigRepo
      .createQueryBuilder()
      .update(EmailConfiguration)
      .set({
        lastSentAt: new Date(),
        lastError: null,
        totalSent: () => 'total_sent + 1',
      })
      .where('id = :id', { id: config.id })
      .execute();

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${workspaceId}`);
  }

  /**
   * Record an error and potentially set status to 'error' after 3 consecutive failures.
   */
  private async recordError(config: EmailConfiguration, errorMsg: string): Promise<void> {
    // Check if the last 3 send attempts (any status) were ALL failures
    const recentLogs = await this.emailSendLogRepo.find({
      where: { workspaceId: config.workspaceId },
      order: { createdAt: 'DESC' },
      take: 3,
    });

    const updateData: Partial<EmailConfiguration> = {
      lastError: errorMsg,
      lastErrorAt: new Date(),
    };

    // Only set to error if the last 3 sends were all consecutive failures
    if (recentLogs.length >= 3 && recentLogs.every(log => log.status === 'failed')) {
      updateData.status = 'error';
      this.logger.warn(
        `Email configuration for workspace ${config.workspaceId} set to error after 3 consecutive failures`,
      );
    }

    await this.emailConfigRepo.update({ id: config.id }, updateData as any);

    // Invalidate cache
    await this.redisService.del(`${CACHE_PREFIX}${config.workspaceId}`);
  }
}
