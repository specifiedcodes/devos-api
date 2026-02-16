/**
 * VAPID Key Service
 * Story 16.7: VAPID Key Web Push Setup
 *
 * Manages VAPID key generation, validation, and rotation support.
 * Extracts VAPID key concerns from PushNotificationService for
 * better separation of responsibilities.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';

export interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface VapidKeyStatus {
  configured: boolean;
  publicKeyPresent: boolean;
  privateKeyPresent: boolean;
  subjectConfigured: boolean;
  publicKeyPrefix: string;       // First 8 chars for identification
  subject: string;
  keyFormat: 'valid' | 'invalid' | 'missing';
  lastRotatedAt?: string;        // ISO timestamp from env or config
}

@Injectable()
export class VapidKeyService implements OnModuleInit {
  private readonly logger = new Logger(VapidKeyService.name);
  private isConfigured = false;
  private publicKey: string | null = null;
  private subject: string;

  constructor(private readonly configService: ConfigService) {
    this.subject = this.configService.get<string>('VAPID_SUBJECT', 'mailto:admin@devos.app');
  }

  onModuleInit(): void {
    this.initializeVapidKeys();
  }

  /**
   * Initialize VAPID details from environment.
   * Validates key format before configuring web-push.
   */
  private initializeVapidKeys(): void {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys not configured - push notifications disabled. Run "npx ts-node scripts/generate-vapid-keys.ts" to generate keys.',
      );
      return;
    }

    if (!this.validateKeyFormat(publicKey, 'public')) {
      this.logger.error(
        'VAPID public key has invalid format. Expected URL-safe base64 string (65 bytes when decoded).',
      );
      return;
    }

    if (!this.validateKeyFormat(privateKey, 'private')) {
      this.logger.error(
        'VAPID private key has invalid format. Expected URL-safe base64 string (32 bytes when decoded).',
      );
      return;
    }

    if (!this.subject.startsWith('mailto:')) {
      this.logger.error(
        'VAPID_SUBJECT must start with "mailto:". Current value: ' +
          this.subject.substring(0, 10) +
          '...',
      );
      return;
    }

    try {
      webPush.setVapidDetails(this.subject, publicKey, privateKey);
      this.publicKey = publicKey;
      this.isConfigured = true;
      this.logger.log(
        'VAPID keys configured successfully (public key prefix: ' +
          publicKey.substring(0, 8) +
          '...)',
      );
    } catch (error) {
      this.logger.error('Failed to configure VAPID details:', error);
    }
  }

  /**
   * Validate VAPID key format (URL-safe base64).
   */
  validateKeyFormat(key: string, type: 'public' | 'private'): boolean {
    if (!key || typeof key !== 'string') return false;

    // URL-safe base64 pattern
    const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
    if (!base64UrlRegex.test(key)) return false;

    // Public keys are 65 bytes (130 hex chars, ~88 base64 chars)
    // Private keys are 32 bytes (64 hex chars, ~44 base64 chars)
    if (type === 'public' && (key.length < 80 || key.length > 100)) return false;
    if (type === 'private' && (key.length < 38 || key.length > 50)) return false;

    return true;
  }

  /**
   * Generate a new VAPID key pair.
   * Used by CLI script and admin endpoint.
   */
  generateKeyPair(): VapidKeyPair {
    const keys = webPush.generateVAPIDKeys();
    return {
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    };
  }

  /**
   * Get current VAPID key status for health checks.
   */
  getKeyStatus(): VapidKeyStatus {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const lastRotated = this.configService.get<string>('VAPID_LAST_ROTATED');

    let keyFormat: 'valid' | 'invalid' | 'missing' = 'missing';
    if (publicKey && privateKey) {
      keyFormat =
        this.validateKeyFormat(publicKey, 'public') &&
        this.validateKeyFormat(privateKey, 'private')
          ? 'valid'
          : 'invalid';
    }

    return {
      configured: this.isConfigured,
      publicKeyPresent: !!publicKey,
      privateKeyPresent: !!privateKey,
      subjectConfigured: this.subject.startsWith('mailto:'),
      publicKeyPrefix: publicKey ? publicKey.substring(0, 8) : '',
      subject: this.maskSubject(this.subject),
      keyFormat,
      lastRotatedAt: lastRotated || undefined,
    };
  }

  /**
   * Check if VAPID keys are properly configured.
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Get the VAPID public key for client-side subscription.
   */
  getPublicKey(): string | null {
    return this.publicKey;
  }

  /**
   * Get the VAPID subject.
   */
  getSubject(): string {
    return this.subject;
  }

  /**
   * Mask the email in the VAPID subject for safe display in status endpoints.
   * e.g. "mailto:admin@devos.app" -> "mailto:a***n@d***s.app"
   */
  private maskSubject(subject: string): string {
    if (!subject.startsWith('mailto:')) return subject;
    const email = subject.substring(7); // Remove "mailto:"
    const atIndex = email.indexOf('@');
    if (atIndex < 1) return subject;

    const local = email.substring(0, atIndex);
    const domain = email.substring(atIndex + 1);

    const maskedLocal = local.length <= 2
      ? local[0] + '***'
      : local[0] + '***' + local[local.length - 1];

    const dotIndex = domain.lastIndexOf('.');
    if (dotIndex < 1) return `mailto:${maskedLocal}@${domain}`;

    const domainName = domain.substring(0, dotIndex);
    const tld = domain.substring(dotIndex);
    const maskedDomain = domainName.length <= 2
      ? domainName[0] + '***'
      : domainName[0] + '***' + domainName[domainName.length - 1];

    return `mailto:${maskedLocal}@${maskedDomain}${tld}`;
  }
}
