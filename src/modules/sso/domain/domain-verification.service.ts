import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { promises as dns } from 'dns';
import { SsoDomain, DomainStatus } from '../../../database/entities/sso-domain.entity';
import { SamlConfiguration } from '../../../database/entities/saml-configuration.entity';
import { OidcConfiguration } from '../../../database/entities/oidc-configuration.entity';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../redis/redis.service';
import { DOMAIN_CONSTANTS } from '../constants/domain.constants';
import { DomainLookupResponseDto } from '../dto/domain.dto';

export interface DomainLookupResult {
  domain: string;
  providerType: 'saml' | 'oidc';
  providerId: string;
  providerName?: string;
  workspaceId: string;
}

@Injectable()
export class DomainVerificationService {
  private readonly logger = new Logger(DomainVerificationService.name);

  constructor(
    @InjectRepository(SsoDomain)
    private readonly ssoDomainRepository: Repository<SsoDomain>,
    @InjectRepository(SamlConfiguration)
    private readonly samlConfigRepository: Repository<SamlConfiguration>,
    @InjectRepository(OidcConfiguration)
    private readonly oidcConfigRepository: Repository<OidcConfiguration>,
    private readonly ssoAuditService: SsoAuditService,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Register a new domain for SSO verification.
   * Generates a verification token and sets expiry to 7 days.
   */
  async registerDomain(
    workspaceId: string,
    domain: string,
    userId: string,
  ): Promise<SsoDomain> {
    const normalizedDomain = this.normalizeDomain(domain);

    // Check if domain is blocked
    if ((DOMAIN_CONSTANTS.BLOCKED_DOMAINS as readonly string[]).includes(normalizedDomain)) {
      throw new BadRequestException(`Domain '${normalizedDomain}' is a blocked public email provider`);
    }

    // Check workspace domain limit
    const existingCount = await this.ssoDomainRepository.count({
      where: { workspaceId },
    });
    if (existingCount >= DOMAIN_CONSTANTS.MAX_DOMAINS_PER_WORKSPACE) {
      throw new UnprocessableEntityException(
        `Workspace has reached the maximum of ${DOMAIN_CONSTANTS.MAX_DOMAINS_PER_WORKSPACE} domains`,
      );
    }

    // Check if domain is already claimed (and not expired)
    const existingDomain = await this.ssoDomainRepository.findOne({
      where: { domain: normalizedDomain },
    });

    if (existingDomain) {
      if (existingDomain.status === DomainStatus.EXPIRED) {
        // Allow re-registration of expired domains - use transaction for atomicity
        await this.dataSource.transaction(async (manager) => {
          await manager.remove(existingDomain);
        });
      } else {
        throw new ConflictException(`Domain '${normalizedDomain}' is already registered`);
      }
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Calculate expiry (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DOMAIN_CONSTANTS.PENDING_EXPIRY_DAYS);

    const ssoDomain = this.ssoDomainRepository.create({
      workspaceId,
      domain: normalizedDomain,
      verificationToken,
      status: DomainStatus.PENDING,
      expiresAt,
      createdBy: userId,
    });

    const saved = await this.ssoDomainRepository.save(ssoDomain);

    // Log audit event (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.DOMAIN_REGISTERED,
      actorId: userId,
      domainId: saved.id,
      details: { domain: normalizedDomain },
    });

    return saved;
  }

  /**
   * Trigger a manual verification check for a pending domain.
   */
  async verifyDomain(
    workspaceId: string,
    domainId: string,
    userId: string,
  ): Promise<SsoDomain> {
    const domain = await this.findDomainOrThrow(workspaceId, domainId);

    const result = await this.checkDnsVerification(domain.domain, domain.verificationToken);

    domain.lastCheckAt = new Date();
    domain.checkCount += 1;

    if (result.verified) {
      domain.status = DomainStatus.VERIFIED;
      domain.verifiedAt = new Date();
      // Set expiry to 12 months from verification
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + DOMAIN_CONSTANTS.VERIFIED_EXPIRY_MONTHS);
      domain.expiresAt = expiresAt;
      domain.lastCheckError = null;

      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.DOMAIN_VERIFIED,
        actorId: userId,
        domainId: domain.id,
        details: { domain: domain.domain },
      });
    } else {
      domain.lastCheckError = result.error || 'Verification token not found in DNS TXT records';

      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.DOMAIN_VERIFICATION_FAILED,
        actorId: userId,
        domainId: domain.id,
        details: { domain: domain.domain, error: domain.lastCheckError },
      });
    }

    return this.ssoDomainRepository.save(domain);
  }

  /**
   * List all domains for a workspace with optional status filter.
   */
  async listDomains(
    workspaceId: string,
    status?: DomainStatus,
  ): Promise<SsoDomain[]> {
    const where: Record<string, unknown> = { workspaceId };
    if (status) {
      where.status = status;
    }
    return this.ssoDomainRepository.find({
      where,
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get a single domain by ID (validates workspace ownership).
   */
  async getDomain(
    workspaceId: string,
    domainId: string,
  ): Promise<SsoDomain> {
    return this.findDomainOrThrow(workspaceId, domainId);
  }

  /**
   * Remove a domain (verified or pending).
   * Invalidates cache entry.
   */
  async removeDomain(
    workspaceId: string,
    domainId: string,
    userId: string,
  ): Promise<void> {
    const domain = await this.findDomainOrThrow(workspaceId, domainId);

    // Invalidate cache
    const cacheKey = `${DOMAIN_CONSTANTS.CACHE_KEY_PREFIX}${domain.domain}`;
    await this.redisService.del(cacheKey);

    await this.ssoDomainRepository.remove(domain);

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.DOMAIN_REMOVED,
      actorId: userId,
      domainId,
      details: { domain: domain.domain },
    });
  }

  /**
   * Link a verified domain to a SAML or OIDC provider.
   * Only one provider can be linked at a time.
   * Domain must be verified.
   */
  async linkProvider(
    workspaceId: string,
    domainId: string,
    samlConfigId: string | null,
    oidcConfigId: string | null,
    userId: string,
  ): Promise<SsoDomain> {
    const domain = await this.findDomainOrThrow(workspaceId, domainId);

    if (domain.status !== DomainStatus.VERIFIED) {
      throw new UnprocessableEntityException('Domain must be verified before linking a provider');
    }

    // Exactly one provider must be specified
    if (!samlConfigId && !oidcConfigId) {
      throw new BadRequestException('Either samlConfigId or oidcConfigId must be provided');
    }
    if (samlConfigId && oidcConfigId) {
      throw new BadRequestException('Only one provider can be linked at a time');
    }

    if (samlConfigId) {
      // Validate SAML config exists and belongs to workspace
      const samlConfig = await this.samlConfigRepository.findOne({
        where: { id: samlConfigId, workspaceId },
      });
      if (!samlConfig) {
        throw new BadRequestException('SAML configuration not found in this workspace');
      }
      domain.samlConfigId = samlConfigId;
      domain.oidcConfigId = null;
    }

    if (oidcConfigId) {
      // Validate OIDC config exists and belongs to workspace
      const oidcConfig = await this.oidcConfigRepository.findOne({
        where: { id: oidcConfigId, workspaceId },
      });
      if (!oidcConfig) {
        throw new BadRequestException('OIDC configuration not found in this workspace');
      }
      domain.oidcConfigId = oidcConfigId;
      domain.samlConfigId = null;
    }

    const saved = await this.ssoDomainRepository.save(domain);

    // Invalidate cache for this domain
    const cacheKey = `${DOMAIN_CONSTANTS.CACHE_KEY_PREFIX}${domain.domain}`;
    await this.redisService.del(cacheKey);

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.DOMAIN_PROVIDER_LINKED,
      actorId: userId,
      domainId: domain.id,
      samlConfigId: samlConfigId || undefined,
      oidcConfigId: oidcConfigId || undefined,
      details: {
        domain: domain.domain,
        providerType: samlConfigId ? 'saml' : 'oidc',
      },
    });

    return saved;
  }

  /**
   * Look up SSO provider for an email domain.
   * Used during login to auto-route to correct IdP.
   * Cached in Redis for 5 minutes.
   */
  async lookupDomain(
    emailDomain: string,
  ): Promise<DomainLookupResult | null> {
    const normalizedDomain = this.normalizeDomain(emailDomain);

    // Check cache first
    const cacheKey = `${DOMAIN_CONSTANTS.CACHE_KEY_PREFIX}${normalizedDomain}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // cached null means "not found" was cached
      if (parsed === null) return null;
      return parsed as DomainLookupResult;
    }

    const domain = await this.ssoDomainRepository.findOne({
      where: { domain: normalizedDomain, status: DomainStatus.VERIFIED },
    });

    if (!domain || (!domain.samlConfigId && !domain.oidcConfigId)) {
      // Cache the null result with shorter TTL to reduce setup latency
      await this.redisService.set(cacheKey, JSON.stringify(null), DOMAIN_CONSTANTS.CACHE_NEGATIVE_TTL_SECONDS);
      return null;
    }

    // Check if domain hasn't expired
    if (domain.expiresAt && domain.expiresAt < new Date()) {
      await this.redisService.set(cacheKey, JSON.stringify(null), DOMAIN_CONSTANTS.CACHE_NEGATIVE_TTL_SECONDS);
      return null;
    }

    let result: DomainLookupResult;

    if (domain.samlConfigId) {
      const samlConfig = await this.samlConfigRepository.findOne({
        where: { id: domain.samlConfigId },
      });
      result = {
        domain: normalizedDomain,
        providerType: 'saml',
        providerId: domain.samlConfigId,
        providerName: samlConfig?.providerName,
        workspaceId: domain.workspaceId,
      };
    } else {
      const oidcConfig = await this.oidcConfigRepository.findOne({
        where: { id: domain.oidcConfigId! },
      });
      result = {
        domain: normalizedDomain,
        providerType: 'oidc',
        providerId: domain.oidcConfigId!,
        providerName: oidcConfig?.displayName || oidcConfig?.providerType,
        workspaceId: domain.workspaceId,
      };
    }

    // Cache the result
    await this.redisService.set(cacheKey, JSON.stringify(result), DOMAIN_CONSTANTS.CACHE_TTL_SECONDS);

    return result;
  }

  /**
   * Perform DNS TXT record verification for a domain.
   */
  async checkDnsVerification(
    domain: string,
    verificationToken: string,
  ): Promise<{ verified: boolean; error?: string }> {
    try {
      const records = await dns.resolveTxt(domain);
      // records is string[][] (each TXT record is an array of strings)
      const flatRecords = records.map((r) => r.join(''));
      const expectedValue = `${DOMAIN_CONSTANTS.VERIFICATION_TXT_PREFIX}${verificationToken}`;
      const verified = flatRecords.some((r) => r === expectedValue);
      return { verified };
    } catch (error) {
      const dnsError = error as NodeJS.ErrnoException;
      if (dnsError.code === 'ENOTFOUND' || dnsError.code === 'ENODATA') {
        return { verified: false, error: `No TXT records found for ${domain}` };
      }
      return { verified: false, error: `DNS lookup failed: ${dnsError.message}` };
    }
  }

  /**
   * Normalize domain: lowercase, trim, remove trailing dot and protocol prefix
   */
  normalizeDomain(domain: string): string {
    return domain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\.$/, '');
  }

  private async findDomainOrThrow(workspaceId: string, domainId: string): Promise<SsoDomain> {
    const domain = await this.ssoDomainRepository.findOne({
      where: { id: domainId, workspaceId },
    });

    if (!domain) {
      throw new NotFoundException(`Domain ${domainId} not found`);
    }

    return domain;
  }
}
