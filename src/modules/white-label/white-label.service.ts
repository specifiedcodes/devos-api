/**
 * White-Label Service
 * Story 22-1: White-Label Configuration (AC3)
 *
 * Core service for managing white-label configuration with Redis caching,
 * custom CSS sanitization, logo/favicon upload, and domain verification.
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as dns from 'dns';
import {
  WhiteLabelConfig,
  BackgroundMode,
  DomainStatus,
  BackgroundType,
} from '../../database/entities/white-label-config.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { RedisService } from '../redis/redis.service';
import { FileStorageService } from '../file-storage/file-storage.service';
import { AuditService, AuditAction } from '../../shared/audit/audit.service';
import { UpdateWhiteLabelConfigDto } from './dto/update-white-label-config.dto';
import { UpdateLoginPageConfigDto } from './dto/update-login-page-config.dto';

const CACHE_PREFIX_CONFIG = 'wl:config:';
const CACHE_PREFIX_DOMAIN = 'wl:domain:';
const CACHE_TTL_SECONDS = 300; // 5 minutes

const WHITE_LABEL_BUCKET = 'devos-uploads';

const RESERVED_DOMAINS = [
  'devos.com',
  'devos.app',
  'devos.io',
  'devos.dev',
];

const ALLOWED_LOGO_MIMES = [
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
];

const ALLOWED_FAVICON_MIMES = [
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/png',
];

const MAX_LOGO_SIZE = 500 * 1024; // 500KB
const MAX_FAVICON_SIZE = 100 * 1024; // 100KB

@Injectable()
export class WhiteLabelService {
  private readonly logger = new Logger(WhiteLabelService.name);

  constructor(
    @InjectRepository(WhiteLabelConfig)
    private readonly whiteLabelRepo: Repository<WhiteLabelConfig>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly redisService: RedisService,
    private readonly fileStorageService: FileStorageService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get config for a workspace (cache-aside with 5-minute TTL)
   */
  async getConfig(workspaceId: string): Promise<WhiteLabelConfig | null> {
    // Try cache first
    const cacheKey = `${CACHE_PREFIX_CONFIG}${workspaceId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as WhiteLabelConfig;
      } catch {
        // Cache corruption, fall through to DB
      }
    }

    // Query DB
    const config = await this.whiteLabelRepo.findOne({
      where: { workspaceId },
    });

    // Populate cache on miss
    if (config) {
      await this.redisService.set(cacheKey, JSON.stringify(config), CACHE_TTL_SECONDS);
    }

    return config;
  }

  /**
   * Create or update white-label config
   */
  async upsertConfig(
    workspaceId: string,
    dto: UpdateWhiteLabelConfigDto,
    actorId: string,
  ): Promise<WhiteLabelConfig> {
    let config = await this.whiteLabelRepo.findOne({
      where: { workspaceId },
    });

    // Sanitize custom CSS if provided
    if (dto.customCss !== undefined && dto.customCss !== null) {
      dto.customCss = this.sanitizeCustomCss(dto.customCss);
    }

    if (config) {
      // Update existing
      Object.assign(config, dto);
      config = await this.whiteLabelRepo.save(config);
    } else {
      // Create new
      config = this.whiteLabelRepo.create({
        workspaceId,
        createdBy: actorId,
        ...dto,
      });
      config = await this.whiteLabelRepo.save(config);
    }

    await this.invalidateCache(workspaceId);

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'white_label_config',
        config.id,
        { action: 'white_label.config.updated', changes: dto },
      )
      .catch(() => {});

    return config;
  }

  /**
   * Upload logo (primary or dark variant)
   */
  async uploadLogo(
    workspaceId: string,
    file: Express.Multer.File,
    variant: 'primary' | 'dark',
    actorId: string,
  ): Promise<{ url: string }> {
    // Validate file size
    if (file.size > MAX_LOGO_SIZE) {
      throw new BadRequestException(
        `Logo file size ${file.size} exceeds maximum of 500KB`,
      );
    }

    // Validate MIME type
    if (!ALLOWED_LOGO_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported logo file type: ${file.mimetype}. Allowed: SVG, PNG, JPEG, WebP`,
      );
    }

    // Sanitize SVG content
    let buffer = file.buffer;
    if (file.mimetype === 'image/svg+xml') {
      buffer = Buffer.from(this.sanitizeSvg(buffer.toString('utf-8')));
    }

    // Determine file extension
    const ext = this.getExtension(file.mimetype);
    const key = `white-label/${workspaceId}/logo-${variant}.${ext}`;

    await this.fileStorageService.upload(WHITE_LABEL_BUCKET, key, buffer, {
      contentType: file.mimetype,
    });

    const url = await this.fileStorageService.getSignedUrl(WHITE_LABEL_BUCKET, key, 3600);

    // Update config with logo URL (store the signed URL, not the raw S3 key)
    let config = await this.whiteLabelRepo.findOne({ where: { workspaceId } });
    if (!config) {
      config = this.whiteLabelRepo.create({
        workspaceId,
        createdBy: actorId,
      });
    }
    if (variant === 'primary') {
      config.logoUrl = url;
    } else {
      config.logoDarkUrl = url;
    }
    await this.whiteLabelRepo.save(config);
    await this.invalidateCache(workspaceId);

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'white_label_config',
        config.id,
        { action: 'white_label.logo.uploaded', variant, filename: file.originalname },
      )
      .catch(() => {});

    return { url };
  }

  /**
   * Upload favicon
   */
  async uploadFavicon(
    workspaceId: string,
    file: Express.Multer.File,
    actorId: string,
  ): Promise<{ url: string }> {
    // Validate file size
    if (file.size > MAX_FAVICON_SIZE) {
      throw new BadRequestException(
        `Favicon file size ${file.size} exceeds maximum of 100KB`,
      );
    }

    // Validate MIME type
    if (!ALLOWED_FAVICON_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported favicon file type: ${file.mimetype}. Allowed: ICO, PNG`,
      );
    }

    const ext = file.mimetype === 'image/png' ? 'png' : 'ico';
    const key = `white-label/${workspaceId}/favicon.${ext}`;

    await this.fileStorageService.upload(WHITE_LABEL_BUCKET, key, file.buffer, {
      contentType: file.mimetype,
    });

    const url = await this.fileStorageService.getSignedUrl(WHITE_LABEL_BUCKET, key, 3600);

    // Update config with favicon URL (store the signed URL, not the raw S3 key)
    let config = await this.whiteLabelRepo.findOne({ where: { workspaceId } });
    if (!config) {
      config = this.whiteLabelRepo.create({
        workspaceId,
        createdBy: actorId,
      });
    }
    config.faviconUrl = url;
    await this.whiteLabelRepo.save(config);
    await this.invalidateCache(workspaceId);

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'white_label_config',
        config.id,
        { action: 'white_label.favicon.uploaded', filename: file.originalname },
      )
      .catch(() => {});

    return { url };
  }

  /**
   * Set custom domain and generate verification token
   */
  async setCustomDomain(
    workspaceId: string,
    domain: string,
    actorId: string,
  ): Promise<{ verificationToken: string; cnameTarget: string; txtRecord: string }> {
    // Normalize domain to lowercase
    const normalizedDomain = domain.toLowerCase().trim();

    // Check reserved domains
    const isReserved = RESERVED_DOMAINS.some(
      (reserved) =>
        normalizedDomain === reserved || normalizedDomain.endsWith(`.${reserved}`),
    );
    if (isReserved) {
      throw new BadRequestException(
        `Domain ${normalizedDomain} is a reserved DevOS domain`,
      );
    }

    // Check domain uniqueness
    const existing = await this.whiteLabelRepo.findOne({
      where: { customDomain: normalizedDomain },
    });
    if (existing && existing.workspaceId !== workspaceId) {
      throw new ConflictException(
        `Domain ${normalizedDomain} is already in use by another workspace`,
      );
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Upsert config with domain info
    let config = await this.whiteLabelRepo.findOne({ where: { workspaceId } });
    if (!config) {
      config = this.whiteLabelRepo.create({
        workspaceId,
        createdBy: actorId,
      });
    }
    config.customDomain = normalizedDomain;
    config.domainStatus = DomainStatus.PENDING;
    config.domainVerificationToken = verificationToken;
    config.domainVerifiedAt = null;
    config.sslProvisioned = false;

    await this.whiteLabelRepo.save(config);
    await this.invalidateCache(workspaceId);

    const cnameTarget = this.configService.get<string>('WHITE_LABEL_CNAME_TARGET', 'custom.devos.com');
    const txtRecord = `_devos-verification.${normalizedDomain}`;

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'white_label_config',
        config.id,
        { action: 'white_label.domain.set', domain: normalizedDomain },
      )
      .catch(() => {});

    return {
      verificationToken,
      cnameTarget,
      txtRecord,
    };
  }

  /**
   * Verify custom domain via DNS lookup (CNAME + TXT record check)
   */
  async verifyDomain(
    workspaceId: string,
    actorId: string,
  ): Promise<{
    verified: boolean;
    cnameValid: boolean;
    txtValid: boolean;
    errors: string[];
  }> {
    const config = await this.whiteLabelRepo.findOne({ where: { workspaceId } });
    if (!config || !config.customDomain) {
      throw new NotFoundException('No custom domain configured for this workspace');
    }

    const errors: string[] = [];
    let cnameValid = false;
    let txtValid = false;

    const cnameTarget = this.configService.get<string>('WHITE_LABEL_CNAME_TARGET', 'custom.devos.com');

    // Update status to verifying
    config.domainStatus = DomainStatus.VERIFYING;
    await this.whiteLabelRepo.save(config);

    // Check CNAME record
    try {
      const cnameRecords = await dns.promises.resolveCname(config.customDomain);
      cnameValid = cnameRecords.some(
        (record) => record.toLowerCase() === cnameTarget.toLowerCase(),
      );
      if (!cnameValid) {
        errors.push(
          `CNAME record does not point to ${cnameTarget}. Found: ${cnameRecords.join(', ')}`,
        );
      }
    } catch (err: any) {
      errors.push(`CNAME record not found for ${config.customDomain}: ${err.code || err.message}`);
    }

    // Check TXT record
    try {
      const txtRecordHost = `_devos-verification.${config.customDomain}`;
      const txtRecords = await dns.promises.resolveTxt(txtRecordHost);
      const expectedValue = `devos-verify=${config.domainVerificationToken}`;
      txtValid = txtRecords.some((records) =>
        records.some((record) => record === expectedValue),
      );
      if (!txtValid) {
        errors.push(
          `TXT record does not contain expected verification token at ${txtRecordHost}`,
        );
      }
    } catch (err: any) {
      errors.push(
        `TXT record not found for _devos-verification.${config.customDomain}: ${err.code || err.message}`,
      );
    }

    const verified = cnameValid && txtValid;

    if (verified) {
      config.domainStatus = DomainStatus.VERIFIED;
      config.domainVerifiedAt = new Date();
    } else {
      config.domainStatus = DomainStatus.FAILED;
    }

    await this.whiteLabelRepo.save(config);
    await this.invalidateCache(workspaceId);

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'white_label_config',
        config.id,
        {
          action: verified ? 'white_label.domain.verified' : 'white_label.domain.verification_failed',
          domain: config.customDomain,
          cnameValid,
          txtValid,
        },
      )
      .catch(() => {});

    return { verified, cnameValid, txtValid, errors };
  }

  /**
   * Remove custom domain
   */
  async removeDomain(workspaceId: string, actorId: string): Promise<void> {
    const config = await this.whiteLabelRepo.findOne({ where: { workspaceId } });
    if (!config) {
      throw new NotFoundException('No white-label config found for this workspace');
    }

    const previousDomain = config.customDomain;
    config.customDomain = null;
    config.domainStatus = null;
    config.domainVerificationToken = null;
    config.domainVerifiedAt = null;
    config.sslProvisioned = false;

    await this.whiteLabelRepo.save(config);
    await this.invalidateCache(workspaceId);

    // Also invalidate domain cache if was set
    if (previousDomain) {
      await this.redisService.del(`${CACHE_PREFIX_DOMAIN}${previousDomain}`);
    }

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'white_label_config',
        config.id,
        { action: 'white_label.domain.removed', domain: previousDomain },
      )
      .catch(() => {});
  }

  /**
   * Reset config to DevOS defaults
   */
  async resetToDefaults(workspaceId: string, actorId: string): Promise<WhiteLabelConfig> {
    let config = await this.whiteLabelRepo.findOne({ where: { workspaceId } });
    if (!config) {
      throw new NotFoundException('No white-label config found for this workspace');
    }

    const previousDomain = config.customDomain;

    config.appName = 'DevOS';
    config.logoUrl = null;
    config.logoDarkUrl = null;
    config.faviconUrl = null;
    config.primaryColor = '#6366F1';
    config.secondaryColor = '#8B5CF6';
    config.backgroundMode = BackgroundMode.SYSTEM;
    config.fontFamily = 'Inter';
    config.customCss = null;
    config.isActive = false;

    config = await this.whiteLabelRepo.save(config);
    await this.invalidateCache(workspaceId);

    if (previousDomain) {
      await this.redisService.del(`${CACHE_PREFIX_DOMAIN}${previousDomain}`);
    }

    // Audit log
    this.auditService
      .log(
        workspaceId,
        actorId,
        AuditAction.UPDATE,
        'white_label_config',
        config.id,
        { action: 'white_label.config.reset' },
      )
      .catch(() => {});

    return config;
  }

  /**
   * Get active config by custom domain (for domain-based routing)
   */
  async getConfigByDomain(domain: string): Promise<WhiteLabelConfig | null> {
    const normalizedDomain = domain.toLowerCase().trim();

    // Try cache first
    const cacheKey = `${CACHE_PREFIX_DOMAIN}${normalizedDomain}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as WhiteLabelConfig;
      } catch {
        // Fall through
      }
    }

    const config = await this.whiteLabelRepo.findOne({
      where: {
        customDomain: normalizedDomain,
        domainStatus: DomainStatus.VERIFIED,
        isActive: true,
      },
    });

    if (config) {
      await this.redisService.set(cacheKey, JSON.stringify(config), CACHE_TTL_SECONDS);
    }

    return config;
  }

  /**
   * Generate CSS variables string from config
   */
  generateCssVariables(config: WhiteLabelConfig): string {
    const variables: string[] = [
      `--wl-primary: ${config.primaryColor};`,
      `--wl-secondary: ${config.secondaryColor};`,
      `--wl-font-family: ${config.fontFamily};`,
    ];

    return `:root { ${variables.join(' ')} }`;
  }

  /**
   * Update login page configuration
   */
  async updateLoginPageConfig(
    workspaceId: string,
    dto: UpdateLoginPageConfigDto,
    actorId: string,
  ): Promise<WhiteLabelConfig> {
    // Run in transaction to prevent race conditions
    return await this.dataSource.transaction(async (transactionalManager) => {
      let config = await transactionalManager.findOne(WhiteLabelConfig, { where: { workspaceId } });

      // Determine the effective background type (new or existing)
      const effectiveBackgroundType = dto.backgroundType ?? config?.backgroundType ?? BackgroundType.COLOR;
      const effectiveBackgroundValue = dto.backgroundValue ?? config?.backgroundValue ?? '#f3f4f6';

      // Validate background value against the effective type
      if (!this.validateBackgroundValue(effectiveBackgroundType, effectiveBackgroundValue)) {
        throw new BadRequestException(
          `Invalid background value for type ${effectiveBackgroundType}`,
        );
      }

      // Sanitize login page CSS if provided
      if (dto.loginPageCss !== undefined && dto.loginPageCss !== null) {
        dto.loginPageCss = this.sanitizeLoginPageCss(dto.loginPageCss);
      }

      if (!config) {
        config = transactionalManager.create(WhiteLabelConfig, {
          workspaceId,
          createdBy: actorId,
        });
      }

      // Update only login page fields
      if (dto.showDevosBranding !== undefined) config.showDevosBranding = dto.showDevosBranding;
      if (dto.backgroundType !== undefined) config.backgroundType = dto.backgroundType;
      if (dto.backgroundValue !== undefined) config.backgroundValue = dto.backgroundValue;
      if (dto.heroText !== undefined) config.heroText = dto.heroText;
      if (dto.heroSubtext !== undefined) config.heroSubtext = dto.heroSubtext;
      if (dto.customLinks !== undefined) config.customLinks = dto.customLinks;
      if (dto.showSignup !== undefined) config.showSignup = dto.showSignup;
      if (dto.loginPageCss !== undefined) config.loginPageCss = dto.loginPageCss;

      config = await transactionalManager.save(config);

      await this.invalidateCache(workspaceId);

      // Audit log
      this.auditService
        .log(
          workspaceId,
          actorId,
          AuditAction.UPDATE,
          'white_label_config',
          config.id,
          { action: 'white_label.login_page.updated', changes: dto },
        )
        .catch(() => {});

      return config;
    });
  }

  /**
   * Validate background value based on type
   */
  private validateBackgroundValue(type: BackgroundType, value: string): boolean {
    switch (type) {
      case BackgroundType.COLOR:
        // Must be valid hex color (#rrggbb)
        return /^#[0-9A-Fa-f]{6}$/.test(value);

      case BackgroundType.GRADIENT:
        // Must start with linear-gradient or radial-gradient
        if (!value.startsWith('linear-gradient') && !value.startsWith('radial-gradient')) {
          return false;
        }
        // Strip any url() references (CSS injection prevention)
        if (/url\s*\(/i.test(value)) {
          return false;
        }
        return value.length <= 1024;

      case BackgroundType.IMAGE:
        // Must be valid URL starting with http:// or https://
        if (!value.startsWith('http://') && !value.startsWith('https://')) {
          return false;
        }
        // Must not be a dangerous protocol (javascript:, data:, file:, ftp:, etc.)
        if (/^(javascript|data|file|ftp|blob|about):/i.test(value)) {
          return false;
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Sanitize login page CSS (same rules as customCss)
   */
  private sanitizeLoginPageCss(css: string): string {
    return this.sanitizeCustomCss(css);
  }

  /**
   * Get login page config for public rendering (by domain or workspaceId)
   */
  async getLoginPageConfig(identifier: string): Promise<{
    config: WhiteLabelConfig | null;
    ssoProviders: string[];
  }> {
    let config: WhiteLabelConfig | null = null;
    let workspaceId: string | null = null;

    // Try to parse as UUID -> lookup by workspace_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(identifier)) {
      workspaceId = identifier;
      config = await this.getConfig(identifier);
    } else {
      // Try to lookup by custom_domain
      config = await this.getConfigByDomain(identifier);
      if (config) {
        workspaceId = config.workspaceId;
      }
    }

    if (!config || !workspaceId) {
      return { config: null, ssoProviders: [] };
    }

    // Check if white-label config is active (for public rendering)
    if (!config.isActive) {
      return { config: null, ssoProviders: [] };
    }

    // Detect SSO providers for this workspace
    const ssoProviders: string[] = [];

    // Check for configured SAML connections (would query saml_connections table)
    // For now, we'll check if there's any active SAML config
    try {
      const samlCount = await this.whiteLabelRepo.manager.count(
        'saml_connections',
        { where: { workspaceId, isActive: true } }
      );
      if (samlCount > 0) {
        ssoProviders.push('saml');
      }
    } catch (err) {
      // Table might not exist in tests, ignore
    }

    // Check for configured OIDC connections (would query oidc_connections table)
    try {
      const oidcCount = await this.whiteLabelRepo.manager.count(
        'oidc_connections',
        { where: { workspaceId, isActive: true } }
      );
      if (oidcCount > 0) {
        ssoProviders.push('oidc');
      }
    } catch (err) {
      // Table might not exist in tests, ignore
    }

    return { config, ssoProviders };
  }

  /**
   * Sanitize custom CSS (strip dangerous patterns)
   */
  sanitizeCustomCss(css: string): string {
    let sanitized = css;

    // Strip <script> tags and content
    sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Strip javascript: protocol references
    sanitized = sanitized.replace(/javascript\s*:/gi, '');

    // Strip expression() (IE CSS expression attack)
    sanitized = sanitized.replace(/expression\s*\(/gi, '');

    // Strip url(data:text/html and url(data:application/javascript (data URI injection)
    sanitized = sanitized.replace(/url\s*\(\s*data\s*:\s*text\/html/gi, 'url(blocked');
    sanitized = sanitized.replace(/url\s*\(\s*data\s*:\s*application\/javascript/gi, 'url(blocked');

    // Strip -moz-binding (Firefox XBL binding)
    sanitized = sanitized.replace(/-moz-binding\s*:/gi, '');

    // Strip @import with external URLs (both url() and bare string forms)
    sanitized = sanitized.replace(/@import\s+url\s*\(\s*['"]?https?:\/\//gi, '/* blocked @import */ ');
    sanitized = sanitized.replace(/@import\s+['"]https?:\/\//gi, '/* blocked @import */ ');

    // Limit to 10,000 characters after sanitization
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000);
    }

    return sanitized;
  }

  /**
   * Sanitize SVG content (strip dangerous elements)
   */
  private sanitizeSvg(svg: string): string {
    let sanitized = svg;

    // Strip <script> tags and content
    sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Strip on* event handlers
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Strip xlink:href with javascript: protocol
    sanitized = sanitized.replace(/xlink:href\s*=\s*["']javascript:[^"']*["']/gi, '');

    return sanitized;
  }

  /**
   * Invalidate Redis cache for workspace
   */
  private async invalidateCache(workspaceId: string): Promise<void> {
    await this.redisService.del(`${CACHE_PREFIX_CONFIG}${workspaceId}`);
  }

  /**
   * Get file extension from MIME type
   */
  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/svg+xml': 'svg',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/x-icon': 'ico',
      'image/vnd.microsoft.icon': 'ico',
    };
    return map[mimeType] || 'bin';
  }
}
