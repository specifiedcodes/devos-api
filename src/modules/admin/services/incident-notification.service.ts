import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Incident } from '../../../database/entities/incident.entity';
import { IncidentUpdate } from '../../../database/entities/incident-update.entity';
import { NotificationService } from '../../notification/notification.service';
import { EmailService } from '../../email/email.service';
import { User } from '../../../database/entities/user.entity';

/**
 * IncidentNotificationService
 * Story 14.9: Incident Management (AC4)
 *
 * Dispatches notifications when incident events occur.
 * Supports in-app, email, and webhook channels.
 */
@Injectable()
export class IncidentNotificationService {
  private readonly logger = new Logger(IncidentNotificationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Handle incident.created event.
   * Sends in-app notification to all platform admins,
   * email to ADMIN_ALERT_EMAIL recipients,
   * and webhook for critical incidents.
   */
  @OnEvent('incident.created')
  async handleIncidentCreated(payload: {
    incident: Incident;
    update: IncidentUpdate;
  }): Promise<void> {
    const { incident } = payload;

    try {
      // Send in-app notification to all platform admins
      await this.sendInAppNotification(
        'incident_created',
        `[INCIDENT] ${incident.title}`,
        `${incident.severity} incident affecting ${incident.affectedServices.join(', ')}: ${incident.description}`,
        { incidentId: incident.id, severity: incident.severity },
      );

      // Send email to admin recipients
      await this.sendEmailNotification(
        `[DevOS INCIDENT] ${incident.title}`,
        incident,
        `New ${incident.severity} incident created: ${incident.description}`,
      );

      // For critical incidents: send webhook
      if (incident.severity === 'critical') {
        await this.sendWebhookNotification(incident, 'created');
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle incident.created: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handle incident.updated event.
   * Sends in-app notification to admins,
   * email for critical/major incidents.
   */
  @OnEvent('incident.updated')
  async handleIncidentUpdated(payload: {
    incident: Incident;
    update: IncidentUpdate;
  }): Promise<void> {
    const { incident, update } = payload;

    try {
      // Send in-app notification to all platform admins
      await this.sendInAppNotification(
        'incident_updated',
        `[UPDATE] ${incident.title}`,
        `Status: ${update.status} - ${update.message}`,
        {
          incidentId: incident.id,
          updateId: update.id,
          severity: incident.severity,
        },
      );

      // For critical/major incidents: send email update
      if (incident.severity === 'critical' || incident.severity === 'major') {
        await this.sendEmailNotification(
          `[DevOS INCIDENT UPDATE] ${incident.title}`,
          incident,
          `Status changed to ${update.status}: ${update.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle incident.updated: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handle incident.resolved event.
   * Sends in-app notification and email with resolution details.
   */
  @OnEvent('incident.resolved')
  async handleIncidentResolved(payload: {
    incident: Incident;
    update: IncidentUpdate;
  }): Promise<void> {
    const { incident, update } = payload;

    try {
      const resolutionTime = incident.resolvedAt
        ? this.formatDuration(
            new Date(incident.resolvedAt).getTime() -
              new Date(incident.createdAt).getTime(),
          )
        : 'N/A';

      const postMortemInfo = incident.postMortemUrl
        ? ` Post-mortem: ${incident.postMortemUrl}`
        : '';

      // Send in-app notification to all platform admins
      await this.sendInAppNotification(
        'incident_resolved',
        `[RESOLVED] ${incident.title}`,
        `Incident resolved after ${resolutionTime}. ${update.message}${postMortemInfo}`,
        {
          incidentId: incident.id,
          severity: incident.severity,
          resolutionTime,
        },
      );

      // Send resolution email
      await this.sendEmailNotification(
        `[DevOS RESOLVED] ${incident.title}`,
        incident,
        `Incident resolved after ${resolutionTime}. ${update.message}${postMortemInfo}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle incident.resolved: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send in-app notification to all platform admins.
   */
  private async sendInAppNotification(
    type: string,
    title: string,
    message: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    const admins = await this.userRepository.find({
      where: { isPlatformAdmin: true },
      select: ['id'],
    });

    for (const admin of admins) {
      try {
        await this.notificationService.create({
          workspaceId: 'platform',
          userId: admin.id,
          type,
          title,
          message,
          metadata,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to create in-app notification for admin ${admin.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `In-app notification sent to ${admins.length} admin(s): ${type}`,
    );
  }

  /**
   * Send email notification to configured admin recipients.
   */
  private async sendEmailNotification(
    subject: string,
    incident: Incident,
    body: string,
  ): Promise<void> {
    const recipientStr = this.configService.get<string>('ADMIN_ALERT_EMAIL');
    const recipients = recipientStr
      ? recipientStr.split(',').map((e) => e.trim())
      : [];

    if (recipients.length === 0) {
      this.logger.warn('No ADMIN_ALERT_EMAIL configured for incident emails');
      return;
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const incidentUrl = `${frontendUrl}/dashboard/admin/incidents`;

    for (const email of recipients) {
      try {
        await this.emailService.sendEmail({
          to: email,
          subject,
          template: 'incident-notification',
          context: {
            incidentTitle: incident.title,
            severity: incident.severity,
            status: incident.status,
            description: body,
            affectedServices: incident.affectedServices.join(', '),
            incidentUrl,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to send incident email to ${email}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Incident email sent to ${recipients.length} recipient(s)`,
    );
  }

  /**
   * Send webhook notification for critical incidents.
   */
  private async sendWebhookNotification(
    incident: Incident,
    eventType: string,
  ): Promise<void> {
    const webhookUrl = this.configService.get<string>('INCIDENT_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.warn('No INCIDENT_WEBHOOK_URL configured');
      return;
    }

    const payload = {
      text: `[${incident.severity.toUpperCase()}] ${incident.title} - ${incident.description}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `DevOS Incident ${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Incident:* ${incident.title}`,
            },
            {
              type: 'mrkdwn',
              text: `*Severity:* ${incident.severity}`,
            },
            {
              type: 'mrkdwn',
              text: `*Affected:* ${incident.affectedServices.join(', ')}`,
            },
            {
              type: 'mrkdwn',
              text: `*Time:* ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        this.logger.log(`Incident webhook delivered to ${webhookUrl}`);
      } else {
        this.logger.warn(
          `Incident webhook returned ${response.status}: ${response.statusText}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Incident webhook failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Format duration in milliseconds to a human-readable string.
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  }
}
