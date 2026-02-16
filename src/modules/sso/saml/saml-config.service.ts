import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { SamlConfiguration } from '../../../database/entities/saml-configuration.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { CreateSamlConfigDto } from '../dto/create-saml-config.dto';
import { UpdateSamlConfigDto } from '../dto/update-saml-config.dto';
import { SamlConfigResponseDto } from '../dto/saml-config-response.dto';
import { CertificateInfo } from '../interfaces/saml.interfaces';
import { SAML_CONSTANTS } from '../constants/saml.constants';

@Injectable()
export class SamlConfigService {
  private readonly logger = new Logger(SamlConfigService.name);

  constructor(
    @InjectRepository(SamlConfiguration)
    private readonly samlConfigRepository: Repository<SamlConfiguration>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    private readonly encryptionService: EncryptionService,
    private readonly ssoAuditService: SsoAuditService,
  ) {}

  /**
   * Verify that the actor has admin/owner role in the workspace
   */
  private async verifyWorkspaceAdmin(workspaceId: string, actorId: string): Promise<void> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId: actorId },
    });

    if (!member || (member.role !== WorkspaceRole.ADMIN && member.role !== WorkspaceRole.OWNER)) {
      throw new ForbiddenException('Only workspace admins and owners can manage SAML configurations');
    }
  }

  /**
   * Create a new SAML configuration
   */
  async createConfig(
    workspaceId: string,
    dto: CreateSamlConfigDto,
    actorId: string,
  ): Promise<SamlConfigResponseDto> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    // Validate and parse certificate
    const certInfo = this.parseCertificate(dto.certificate);

    // Encrypt certificate
    const encrypted = this.encryptionService.encryptWithWorkspaceKey(workspaceId, dto.certificate);

    const config = this.samlConfigRepository.create({
      workspaceId,
      providerName: dto.providerName,
      displayName: dto.displayName || null,
      entityId: dto.entityId,
      ssoUrl: dto.ssoUrl,
      sloUrl: dto.sloUrl || null,
      certificate: encrypted.encryptedData,
      certificateIv: encrypted.iv,
      certificateFingerprint: certInfo.fingerprint,
      certificateExpiresAt: certInfo.expiresAt,
      attributeMapping: dto.attributeMapping || SAML_CONSTANTS.DEFAULT_ATTRIBUTE_MAPPING,
      nameIdFormat: dto.nameIdFormat || SAML_CONSTANTS.DEFAULT_NAME_ID_FORMAT,
      wantAssertionsSigned: dto.wantAssertionsSigned ?? true,
      wantResponseSigned: dto.wantResponseSigned ?? true,
      metadataUrl: dto.metadataUrl || null,
    });

    const saved = await this.samlConfigRepository.save(config);

    // Log audit event (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SAML_CONFIG_CREATED,
      actorId,
      samlConfigId: saved.id,
      details: { providerName: dto.providerName, entityId: dto.entityId },
    });

    return this.toResponseDto(saved);
  }

  /**
   * Update a SAML configuration
   */
  async updateConfig(
    workspaceId: string,
    configId: string,
    dto: UpdateSamlConfigDto,
    actorId: string,
  ): Promise<SamlConfigResponseDto> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    const config = await this.findConfigOrThrow(workspaceId, configId);

    // If certificate is being updated
    if (dto.certificate) {
      const certInfo = this.parseCertificate(dto.certificate);
      const encrypted = this.encryptionService.encryptWithWorkspaceKey(workspaceId, dto.certificate);
      config.certificate = encrypted.encryptedData;
      config.certificateIv = encrypted.iv;
      config.certificateFingerprint = certInfo.fingerprint;
      config.certificateExpiresAt = certInfo.expiresAt;
      // Deactivate config when cert changes - require re-testing
      config.isActive = false;
      config.isTested = false;
    }

    // Update other fields
    if (dto.providerName !== undefined) config.providerName = dto.providerName;
    if (dto.displayName !== undefined) config.displayName = dto.displayName || null;
    if (dto.entityId !== undefined) config.entityId = dto.entityId;
    if (dto.ssoUrl !== undefined) config.ssoUrl = dto.ssoUrl;
    if (dto.sloUrl !== undefined) config.sloUrl = dto.sloUrl || null;
    if (dto.attributeMapping !== undefined) config.attributeMapping = dto.attributeMapping;
    if (dto.nameIdFormat !== undefined) config.nameIdFormat = dto.nameIdFormat;
    if (dto.wantAssertionsSigned !== undefined) config.wantAssertionsSigned = dto.wantAssertionsSigned;
    if (dto.wantResponseSigned !== undefined) config.wantResponseSigned = dto.wantResponseSigned;
    if (dto.metadataUrl !== undefined) config.metadataUrl = dto.metadataUrl || null;

    const updated = await this.samlConfigRepository.save(config);

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SAML_CONFIG_UPDATED,
      actorId,
      samlConfigId: configId,
      details: { updatedFields: Object.keys(dto) },
    });

    return this.toResponseDto(updated);
  }

  /**
   * Delete a SAML configuration
   */
  async deleteConfig(
    workspaceId: string,
    configId: string,
    actorId: string,
  ): Promise<void> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    const config = await this.findConfigOrThrow(workspaceId, configId);

    if (config.isActive) {
      this.logger.warn(`Deleting active SAML config ${configId} for workspace ${workspaceId}`);
    }

    await this.samlConfigRepository.remove(config);

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SAML_CONFIG_DELETED,
      actorId,
      samlConfigId: configId,
      details: { providerName: config.providerName, entityId: config.entityId },
    });
  }

  /**
   * Get a SAML configuration
   */
  async getConfig(workspaceId: string, configId: string): Promise<SamlConfigResponseDto> {
    const config = await this.findConfigOrThrow(workspaceId, configId);
    return this.toResponseDto(config);
  }

  /**
   * List SAML configurations for a workspace
   */
  async listConfigs(workspaceId: string): Promise<SamlConfigResponseDto[]> {
    const configs = await this.samlConfigRepository.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
    return configs.map((c) => this.toResponseDto(c));
  }

  /**
   * Get decrypted config for SAML operations (internal use only)
   */
  async getDecryptedConfig(
    workspaceId: string,
    configId: string,
  ): Promise<SamlConfiguration & { decryptedCertificate: string }> {
    const config = await this.findConfigOrThrow(workspaceId, configId);
    const decryptedCertificate = this.encryptionService.decryptWithWorkspaceKey(
      workspaceId,
      config.certificate,
      config.certificateIv,
    );
    return { ...config, decryptedCertificate };
  }

  /**
   * Activate a SAML configuration (must be tested first)
   */
  async activateConfig(
    workspaceId: string,
    configId: string,
    actorId: string,
  ): Promise<SamlConfigResponseDto> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    const config = await this.findConfigOrThrow(workspaceId, configId);

    if (!config.isTested) {
      throw new BadRequestException('Configuration must be tested before activation');
    }

    config.isActive = true;
    const updated = await this.samlConfigRepository.save(config);

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SAML_CONFIG_ACTIVATED,
      actorId,
      samlConfigId: configId,
    });

    return this.toResponseDto(updated);
  }

  /**
   * Deactivate a SAML configuration
   */
  async deactivateConfig(
    workspaceId: string,
    configId: string,
    actorId: string,
  ): Promise<SamlConfigResponseDto> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    const config = await this.findConfigOrThrow(workspaceId, configId);
    config.isActive = false;
    const updated = await this.samlConfigRepository.save(config);

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SAML_CONFIG_DEACTIVATED,
      actorId,
      samlConfigId: configId,
    });

    return this.toResponseDto(updated);
  }

  /**
   * Parse and validate a PEM-encoded X.509 certificate
   */
  parseCertificate(certificatePem: string): CertificateInfo {
    try {
      // Normalize certificate PEM
      const normalizedPem = this.normalizeCertificatePem(certificatePem);

      // Create X509Certificate from PEM
      const x509 = new crypto.X509Certificate(normalizedPem);

      // Extract fingerprint (SHA-256 of DER bytes)
      const fingerprint = x509.fingerprint256.replace(/:/g, '').toLowerCase();

      const expiresAt = new Date(x509.validTo);
      const now = new Date();

      if (expiresAt < now) {
        throw new BadRequestException('Certificate has expired');
      }

      // Warn if certificate expires within 30 days
      const daysUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= SAML_CONSTANTS.CERT_WARN_30_DAYS) {
        this.logger.warn(`SAML certificate expires in ${daysUntilExpiry} days`);
      }

      return {
        fingerprint,
        expiresAt,
        subject: x509.subject,
        issuer: x509.issuer,
        serialNumber: x509.serialNumber,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Invalid certificate: ${error instanceof Error ? error.message : 'Failed to parse certificate'}`,
      );
    }
  }

  /**
   * Find an active configuration by entity ID
   */
  async findActiveConfigByEntityId(entityId: string): Promise<SamlConfiguration | null> {
    return this.samlConfigRepository.findOne({
      where: { entityId, isActive: true },
    });
  }

  /**
   * Update config stats after login (atomic increment via QueryBuilder)
   */
  async updateLoginStats(configId: string): Promise<void> {
    await this.samlConfigRepository
      .createQueryBuilder()
      .update(SamlConfiguration)
      .set({
        loginCount: () => 'login_count + 1',
        lastLoginAt: new Date(),
      })
      .where('id = :id', { id: configId })
      .execute();
  }

  /**
   * Update config stats after error (atomic increment via QueryBuilder)
   */
  async updateErrorStats(configId: string, errorMessage: string): Promise<void> {
    await this.samlConfigRepository
      .createQueryBuilder()
      .update(SamlConfiguration)
      .set({
        errorCount: () => 'error_count + 1',
        lastError: errorMessage,
        lastErrorAt: new Date(),
      })
      .where('id = :id', { id: configId })
      .execute();
  }

  /**
   * Mark config as tested
   */
  async markAsTested(configId: string): Promise<void> {
    await this.samlConfigRepository.update(configId, { isTested: true });
  }

  /**
   * Find active configs for a workspace
   */
  async findActiveConfigsForWorkspace(workspaceId: string): Promise<SamlConfiguration[]> {
    return this.samlConfigRepository.find({
      where: { workspaceId, isActive: true },
    });
  }

  private async findConfigOrThrow(workspaceId: string, configId: string): Promise<SamlConfiguration> {
    const config = await this.samlConfigRepository.findOne({
      where: { id: configId, workspaceId },
    });

    if (!config) {
      throw new NotFoundException(`SAML configuration ${configId} not found`);
    }

    return config;
  }

  private normalizeCertificatePem(pem: string): string {
    // Normalize line endings (\r\n -> \n) and trim
    let cleaned = pem.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!cleaned.startsWith('-----BEGIN CERTIFICATE-----')) {
      // Strip any remaining whitespace from bare base64 content, then re-wrap
      const base64Only = cleaned
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s+/g, '');
      // Re-chunk into 64-char lines for proper PEM format
      const chunked = base64Only.match(/.{1,64}/g)?.join('\n') || base64Only;
      cleaned = `-----BEGIN CERTIFICATE-----\n${chunked}\n-----END CERTIFICATE-----`;
    }
    return cleaned;
  }

  private toResponseDto(config: SamlConfiguration): SamlConfigResponseDto {
    const dto = new SamlConfigResponseDto();
    dto.id = config.id;
    dto.workspaceId = config.workspaceId;
    dto.providerName = config.providerName;
    dto.displayName = config.displayName;
    dto.entityId = config.entityId;
    dto.ssoUrl = config.ssoUrl;
    dto.sloUrl = config.sloUrl;
    dto.certificateFingerprint = config.certificateFingerprint;
    dto.certificateExpiresAt = config.certificateExpiresAt;
    dto.attributeMapping = config.attributeMapping;
    dto.nameIdFormat = config.nameIdFormat;
    dto.wantAssertionsSigned = config.wantAssertionsSigned;
    dto.wantResponseSigned = config.wantResponseSigned;
    dto.isActive = config.isActive;
    dto.isTested = config.isTested;
    dto.lastLoginAt = config.lastLoginAt;
    dto.loginCount = config.loginCount;
    dto.errorCount = config.errorCount;
    dto.lastError = config.lastError;
    dto.metadataUrl = config.metadataUrl;
    dto.createdAt = config.createdAt;
    dto.updatedAt = config.updatedAt;
    return dto;
  }
}
