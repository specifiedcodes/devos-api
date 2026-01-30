import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import {
  SecurityEvent,
  SecurityEventType,
} from '../../../database/entities/security-event.entity';
import { EmailService } from '../../email/email.service';

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  constructor(
    @InjectRepository(SecurityEvent)
    private securityEventRepository: Repository<SecurityEvent>,
    private emailService: EmailService,
  ) {}

  /**
   * Detect login from new country
   */
  async detectLoginAnomaly(
    userId: string,
    ipAddress: string,
    userEmail: string,
  ): Promise<void> {
    try {
      // Get user's previous successful logins
      const previousLogins = await this.securityEventRepository.find({
        where: {
          user_id: userId,
          event_type: SecurityEventType.LOGIN_SUCCESS,
        },
        order: { created_at: 'DESC' },
        take: 10,
      });

      if (previousLogins.length === 0) {
        // First login, no anomaly
        return;
      }

      // Check if this IP is from a different location than previous logins
      const isNewLocation = await this.isIpFromNewLocation(
        ipAddress,
        previousLogins.map((l) => l.ip_address).filter(Boolean) as string[],
      );

      if (isNewLocation) {
        this.logger.warn(
          `Anomaly detected: Login from new location for user ${userId}`,
        );

        // Log anomaly event
        await this.securityEventRepository.save({
          user_id: userId,
          event_type: SecurityEventType.ANOMALY_DETECTED,
          ip_address: ipAddress,
          reason: 'new_country_login',
          metadata: { alert_type: 'new_country' },
        });

        // Send email notification
        await this.emailService.sendEmail({
          to: userEmail,
          subject: 'New login from unfamiliar location',
          template: 'security-alert-new-country',
          context: {
            ip_address: ipAddress,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to detect login anomaly for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Detect multiple failed login attempts
   */
  async detectMultipleFailedAttempts(
    email: string,
    ipAddress: string,
  ): Promise<boolean> {
    try {
      const normalizedEmail = email.toLowerCase();
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      const failedAttempts = await this.securityEventRepository.count({
        where: {
          email: normalizedEmail,
          event_type: SecurityEventType.LOGIN_FAILED,
          ip_address: ipAddress,
          created_at: MoreThanOrEqual(fifteenMinutesAgo),
        },
      });

      if (failedAttempts >= 5) {
        this.logger.warn(
          `Account lockout triggered: ${failedAttempts} failed attempts for ${email} from ${ipAddress}`,
        );

        // Log anomaly event
        await this.securityEventRepository.save({
          email: normalizedEmail,
          event_type: SecurityEventType.ANOMALY_DETECTED,
          ip_address: ipAddress,
          reason: 'multiple_failed_attempts',
          metadata: {
            alert_type: 'account_lockout',
            failed_attempts: failedAttempts,
          },
        });

        return true; // Account should be locked
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Failed to detect multiple failed attempts for ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * Detect abnormal API usage (10x normal rate)
   * Placeholder for future implementation
   */
  async detectAbnormalApiUsage(userId: string): Promise<void> {
    // TODO: Implement API usage tracking and anomaly detection
    // This will be part of rate limiting and usage monitoring
    this.logger.debug(
      `Abnormal API usage detection not yet implemented for user ${userId}`,
    );
  }

  /**
   * Check if IP is from a new location
   * In production, use IP geolocation service (MaxMind, IPinfo)
   */
  private async isIpFromNewLocation(
    newIp: string,
    previousIps: string[],
  ): Promise<boolean> {
    // Placeholder: In production, use MaxMind GeoLite2 or IPinfo
    // For now, simple check if IP is completely different
    return !previousIps.includes(newIp);
  }
}
