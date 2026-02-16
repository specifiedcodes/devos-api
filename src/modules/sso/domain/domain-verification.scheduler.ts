import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { SsoDomain, DomainStatus } from '../../../database/entities/sso-domain.entity';
import { DomainVerificationService } from './domain-verification.service';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../redis/redis.service';
import { DOMAIN_CONSTANTS } from '../constants/domain.constants';

@Injectable()
export class DomainVerificationScheduler {
  private readonly logger = new Logger(DomainVerificationScheduler.name);

  constructor(
    @InjectRepository(SsoDomain)
    private readonly ssoDomainRepository: Repository<SsoDomain>,
    private readonly domainVerificationService: DomainVerificationService,
    private readonly ssoAuditService: SsoAuditService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Check pending domain verifications every 15 minutes.
   * For each pending domain, performs DNS TXT record check.
   * Automatically verifies domains when token is found.
   */
  @Cron('0 */15 * * * *')
  async checkPendingVerifications(): Promise<void> {
    try {
      const pendingDomains = await this.ssoDomainRepository.find({
        where: {
          status: DomainStatus.PENDING,
          expiresAt: MoreThan(new Date()),
        },
      });

      if (pendingDomains.length === 0) {
        return;
      }

      this.logger.log(`Checking ${pendingDomains.length} pending domain verifications`);

      for (const domain of pendingDomains) {
        try {
          const result = await this.domainVerificationService.checkDnsVerification(
            domain.domain,
            domain.verificationToken,
          );

          domain.lastCheckAt = new Date();
          domain.checkCount += 1;

          if (result.verified) {
            domain.status = DomainStatus.VERIFIED;
            domain.verifiedAt = new Date();
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + DOMAIN_CONSTANTS.VERIFIED_EXPIRY_MONTHS);
            domain.expiresAt = expiresAt;
            domain.lastCheckError = null;

            this.logger.log(`Domain ${domain.domain} verified automatically`);

            void this.ssoAuditService.logEvent({
              workspaceId: domain.workspaceId,
              eventType: SsoAuditEventType.DOMAIN_VERIFIED,
              domainId: domain.id,
              details: { domain: domain.domain, source: 'scheduler' },
            });
          } else {
            domain.lastCheckError = result.error || 'Verification token not found';
          }

          await this.ssoDomainRepository.save(domain);
        } catch (error) {
          this.logger.error(`Error checking domain ${domain.domain}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Error in checkPendingVerifications', error);
    }
  }

  /**
   * Expire stale pending domains daily at midnight.
   * Marks pending domains past their 7-day expiry as 'expired'.
   */
  @Cron('0 0 0 * * *')
  async expireStaleDomains(): Promise<void> {
    try {
      const staleDomains = await this.ssoDomainRepository.find({
        where: {
          status: DomainStatus.PENDING,
          expiresAt: LessThan(new Date()),
        },
      });

      if (staleDomains.length === 0) {
        return;
      }

      this.logger.log(`Expiring ${staleDomains.length} stale pending domains`);

      // Batch update all stale domains to expired status
      const domainIds = staleDomains.map((d) => d.id);
      await this.ssoDomainRepository
        .createQueryBuilder()
        .update(SsoDomain)
        .set({ status: DomainStatus.EXPIRED })
        .whereInIds(domainIds)
        .execute();

      // Log audit events for each expired domain (fire-and-forget)
      for (const domain of staleDomains) {
        void this.ssoAuditService.logEvent({
          workspaceId: domain.workspaceId,
          eventType: SsoAuditEventType.DOMAIN_EXPIRED,
          domainId: domain.id,
          details: { domain: domain.domain, reason: 'pending_timeout' },
        });
      }
    } catch (error) {
      this.logger.error('Error in expireStaleDomains', error);
    }
  }

  /**
   * Check verified domain re-verification monthly (1st of each month).
   * Marks verified domains past their 12-month expiry as 'expired'.
   * Invalidates cached lookups.
   */
  @Cron('0 0 0 1 * *')
  async checkVerifiedExpiry(): Promise<void> {
    try {
      const expiredDomains = await this.ssoDomainRepository.find({
        where: {
          status: DomainStatus.VERIFIED,
          expiresAt: LessThan(new Date()),
        },
      });

      if (expiredDomains.length === 0) {
        return;
      }

      this.logger.log(`Expiring ${expiredDomains.length} verified domains past re-verification deadline`);

      // Batch update all expired domains
      const domainIds = expiredDomains.map((d) => d.id);
      await this.ssoDomainRepository
        .createQueryBuilder()
        .update(SsoDomain)
        .set({ status: DomainStatus.EXPIRED })
        .whereInIds(domainIds)
        .execute();

      // Invalidate cache and log audit events for each expired domain
      for (const domain of expiredDomains) {
        const cacheKey = `${DOMAIN_CONSTANTS.CACHE_KEY_PREFIX}${domain.domain}`;
        await this.redisService.del(cacheKey);

        void this.ssoAuditService.logEvent({
          workspaceId: domain.workspaceId,
          eventType: SsoAuditEventType.DOMAIN_EXPIRED,
          domainId: domain.id,
          details: { domain: domain.domain, reason: 'reverification_timeout' },
        });
      }
    } catch (error) {
      this.logger.error('Error in checkVerifiedExpiry', error);
    }
  }
}
