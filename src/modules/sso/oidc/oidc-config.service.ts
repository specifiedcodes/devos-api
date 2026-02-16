import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OidcConfiguration } from '../../../database/entities/oidc-configuration.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { EncryptionService } from '../../../shared/encryption/encryption.service';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { OidcDiscoveryService } from './oidc-discovery.service';
import { CreateOidcConfigDto } from '../dto/create-oidc-config.dto';
import { UpdateOidcConfigDto } from '../dto/update-oidc-config.dto';
import { OidcConfigResponseDto } from '../dto/oidc-config-response.dto';
import { OIDC_CONSTANTS } from '../constants/oidc.constants';

@Injectable()
export class OidcConfigService {
  private readonly logger = new Logger(OidcConfigService.name);

  constructor(
    @InjectRepository(OidcConfiguration)
    private readonly oidcConfigRepository: Repository<OidcConfiguration>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    private readonly encryptionService: EncryptionService,
    private readonly ssoAuditService: SsoAuditService,
    private readonly oidcDiscoveryService: OidcDiscoveryService,
  ) {}

  /**
   * Verify that the actor has admin/owner role in the workspace
   */
  private async verifyWorkspaceAdmin(workspaceId: string, actorId: string): Promise<void> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId: actorId },
    });

    if (!member || (member.role !== WorkspaceRole.ADMIN && member.role !== WorkspaceRole.OWNER)) {
      throw new ForbiddenException('Only workspace admins and owners can manage OIDC configurations');
    }
  }

  /**
   * Create a new OIDC configuration
   */
  async createConfig(
    workspaceId: string,
    dto: CreateOidcConfigDto,
    actorId: string,
  ): Promise<OidcConfigResponseDto> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    // Encrypt client secret
    const encrypted = this.encryptionService.encryptWithWorkspaceKey(workspaceId, dto.clientSecret);

    // Fetch discovery document to validate URL and cache endpoints
    const discovery = await this.oidcDiscoveryService.fetchDiscoveryDocument(dto.discoveryUrl);

    // Apply provider preset scopes if not specified
    const providerPreset = OIDC_CONSTANTS.PROVIDER_PRESETS[dto.providerType];
    const scopes = dto.scopes || (providerPreset ? providerPreset.scopes : OIDC_CONSTANTS.DEFAULT_SCOPES);

    const config = this.oidcConfigRepository.create({
      workspaceId,
      providerType: dto.providerType,
      displayName: dto.displayName || null,
      clientId: dto.clientId,
      clientSecret: encrypted.encryptedData,
      clientSecretIv: encrypted.iv,
      discoveryUrl: dto.discoveryUrl,
      issuer: discovery.issuer,
      authorizationEndpoint: discovery.authorization_endpoint,
      tokenEndpoint: discovery.token_endpoint,
      userinfoEndpoint: discovery.userinfo_endpoint || null,
      jwksUri: discovery.jwks_uri,
      endSessionEndpoint: discovery.end_session_endpoint || null,
      scopes: scopes as string[],
      allowedDomains: dto.allowedDomains || null,
      usePkce: dto.usePkce ?? true,
      tokenEndpointAuthMethod: dto.tokenEndpointAuthMethod || 'client_secret_post',
      attributeMapping: dto.attributeMapping || {
        email: 'email',
        firstName: 'given_name',
        lastName: 'family_name',
        groups: 'groups',
      },
      discoveryLastFetchedAt: new Date(),
    });

    const saved = await this.oidcConfigRepository.save(config);

    // Log audit event (fire-and-forget)
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.OIDC_CONFIG_CREATED,
      actorId,
      oidcConfigId: saved.id,
      details: { providerType: dto.providerType, clientId: dto.clientId },
    });

    return this.toResponseDto(saved);
  }

  /**
   * Update an OIDC configuration
   */
  async updateConfig(
    workspaceId: string,
    configId: string,
    dto: UpdateOidcConfigDto,
    actorId: string,
  ): Promise<OidcConfigResponseDto> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    const config = await this.findConfigOrThrow(workspaceId, configId);

    // If clientSecret is being updated
    if (dto.clientSecret) {
      const encrypted = this.encryptionService.encryptWithWorkspaceKey(workspaceId, dto.clientSecret);
      config.clientSecret = encrypted.encryptedData;
      config.clientSecretIv = encrypted.iv;
      // Deactivate - require re-testing
      config.isActive = false;
      config.isTested = false;
    }

    // If discoveryUrl is being updated
    if (dto.discoveryUrl && dto.discoveryUrl !== config.discoveryUrl) {
      const discovery = await this.oidcDiscoveryService.fetchDiscoveryDocument(dto.discoveryUrl);
      config.discoveryUrl = dto.discoveryUrl;
      config.issuer = discovery.issuer;
      config.authorizationEndpoint = discovery.authorization_endpoint;
      config.tokenEndpoint = discovery.token_endpoint;
      config.userinfoEndpoint = discovery.userinfo_endpoint || null;
      config.jwksUri = discovery.jwks_uri;
      config.endSessionEndpoint = discovery.end_session_endpoint || null;
      config.discoveryLastFetchedAt = new Date();
      // Deactivate - require re-testing
      config.isActive = false;
      config.isTested = false;
    }

    // Update other fields
    if (dto.providerType !== undefined) config.providerType = dto.providerType;
    if (dto.displayName !== undefined) config.displayName = dto.displayName || null;
    if (dto.clientId !== undefined && dto.clientId !== config.clientId) {
      config.clientId = dto.clientId;
      // Deactivate - clientId change requires re-testing
      config.isActive = false;
      config.isTested = false;
    }
    if (dto.scopes !== undefined) config.scopes = dto.scopes;
    if (dto.allowedDomains !== undefined) config.allowedDomains = dto.allowedDomains || null;
    if (dto.usePkce !== undefined) config.usePkce = dto.usePkce;
    if (dto.tokenEndpointAuthMethod !== undefined) config.tokenEndpointAuthMethod = dto.tokenEndpointAuthMethod;
    if (dto.attributeMapping !== undefined) config.attributeMapping = dto.attributeMapping;

    const updated = await this.oidcConfigRepository.save(config);

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.OIDC_CONFIG_UPDATED,
      actorId,
      oidcConfigId: configId,
      details: { updatedFields: Object.keys(dto) },
    });

    return this.toResponseDto(updated);
  }

  /**
   * Delete an OIDC configuration
   */
  async deleteConfig(
    workspaceId: string,
    configId: string,
    actorId: string,
  ): Promise<void> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    const config = await this.findConfigOrThrow(workspaceId, configId);

    if (config.isActive) {
      this.logger.warn(`Deleting active OIDC config ${configId} for workspace ${workspaceId}`);
    }

    await this.oidcConfigRepository.remove(config);

    // Log audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.OIDC_CONFIG_DELETED,
      actorId,
      oidcConfigId: configId,
      details: { providerType: config.providerType, clientId: config.clientId },
    });
  }

  /**
   * Get an OIDC configuration
   */
  async getConfig(workspaceId: string, configId: string): Promise<OidcConfigResponseDto> {
    const config = await this.findConfigOrThrow(workspaceId, configId);
    return this.toResponseDto(config);
  }

  /**
   * List OIDC configurations for a workspace
   */
  async listConfigs(workspaceId: string): Promise<OidcConfigResponseDto[]> {
    const configs = await this.oidcConfigRepository.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
    return configs.map((c) => this.toResponseDto(c));
  }

  /**
   * Get decrypted config (internal use only)
   */
  async getDecryptedConfig(
    workspaceId: string,
    configId: string,
  ): Promise<OidcConfiguration & { decryptedClientSecret: string }> {
    const config = await this.findConfigOrThrow(workspaceId, configId);
    const decryptedClientSecret = this.encryptionService.decryptWithWorkspaceKey(
      workspaceId,
      config.clientSecret,
      config.clientSecretIv,
    );
    return { ...config, decryptedClientSecret };
  }

  /**
   * Activate an OIDC configuration (must be tested first)
   */
  async activateConfig(
    workspaceId: string,
    configId: string,
    actorId: string,
  ): Promise<OidcConfigResponseDto> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    const config = await this.findConfigOrThrow(workspaceId, configId);

    if (!config.isTested) {
      throw new BadRequestException('Configuration must be tested before activation');
    }

    config.isActive = true;
    const updated = await this.oidcConfigRepository.save(config);

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.OIDC_CONFIG_ACTIVATED,
      actorId,
      oidcConfigId: configId,
    });

    return this.toResponseDto(updated);
  }

  /**
   * Deactivate an OIDC configuration
   */
  async deactivateConfig(
    workspaceId: string,
    configId: string,
    actorId: string,
  ): Promise<OidcConfigResponseDto> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    const config = await this.findConfigOrThrow(workspaceId, configId);
    config.isActive = false;
    const updated = await this.oidcConfigRepository.save(config);

    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.OIDC_CONFIG_DEACTIVATED,
      actorId,
      oidcConfigId: configId,
    });

    return this.toResponseDto(updated);
  }

  /**
   * Force refresh OIDC discovery document
   */
  async refreshDiscovery(
    workspaceId: string,
    configId: string,
    actorId: string,
  ): Promise<OidcConfigResponseDto> {
    await this.verifyWorkspaceAdmin(workspaceId, actorId);

    const config = await this.findConfigOrThrow(workspaceId, configId);

    try {
      const discovery = await this.oidcDiscoveryService.fetchDiscoveryDocument(
        config.discoveryUrl,
        true,
      );

      config.issuer = discovery.issuer;
      config.authorizationEndpoint = discovery.authorization_endpoint;
      config.tokenEndpoint = discovery.token_endpoint;
      config.userinfoEndpoint = discovery.userinfo_endpoint || null;
      config.jwksUri = discovery.jwks_uri;
      config.endSessionEndpoint = discovery.end_session_endpoint || null;
      config.discoveryLastFetchedAt = new Date();

      const updated = await this.oidcConfigRepository.save(config);

      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.OIDC_DISCOVERY_FETCHED,
        actorId,
        oidcConfigId: configId,
        details: { issuer: discovery.issuer },
      });

      return this.toResponseDto(updated);
    } catch (error) {
      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.OIDC_DISCOVERY_ERROR,
        actorId,
        oidcConfigId: configId,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      throw error;
    }
  }

  /**
   * Find active configs for a workspace
   */
  async findActiveConfigsForWorkspace(workspaceId: string): Promise<OidcConfiguration[]> {
    return this.oidcConfigRepository.find({
      where: { workspaceId, isActive: true },
    });
  }

  /**
   * Update config stats after login (atomic increment)
   */
  async updateLoginStats(configId: string): Promise<void> {
    await this.oidcConfigRepository
      .createQueryBuilder()
      .update(OidcConfiguration)
      .set({
        loginCount: () => 'login_count + 1',
        lastLoginAt: new Date(),
      })
      .where('id = :id', { id: configId })
      .execute();
  }

  /**
   * Update config stats after error (atomic increment)
   */
  async updateErrorStats(configId: string, errorMessage: string): Promise<void> {
    await this.oidcConfigRepository
      .createQueryBuilder()
      .update(OidcConfiguration)
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
    await this.oidcConfigRepository.update(configId, { isTested: true });
  }

  private async findConfigOrThrow(workspaceId: string, configId: string): Promise<OidcConfiguration> {
    const config = await this.oidcConfigRepository.findOne({
      where: { id: configId, workspaceId },
    });

    if (!config) {
      throw new NotFoundException(`OIDC configuration ${configId} not found`);
    }

    return config;
  }

  private toResponseDto(config: OidcConfiguration): OidcConfigResponseDto {
    const dto = new OidcConfigResponseDto();
    dto.id = config.id;
    dto.workspaceId = config.workspaceId;
    dto.providerType = config.providerType;
    dto.displayName = config.displayName;
    dto.clientId = config.clientId;
    // clientSecret is NEVER exposed
    dto.discoveryUrl = config.discoveryUrl;
    dto.issuer = config.issuer;
    dto.authorizationEndpoint = config.authorizationEndpoint;
    dto.tokenEndpoint = config.tokenEndpoint;
    dto.userinfoEndpoint = config.userinfoEndpoint;
    dto.endSessionEndpoint = config.endSessionEndpoint;
    dto.scopes = config.scopes;
    dto.allowedDomains = config.allowedDomains;
    dto.usePkce = config.usePkce;
    dto.tokenEndpointAuthMethod = config.tokenEndpointAuthMethod;
    dto.attributeMapping = config.attributeMapping;
    dto.isActive = config.isActive;
    dto.isTested = config.isTested;
    dto.lastLoginAt = config.lastLoginAt;
    dto.loginCount = config.loginCount;
    dto.errorCount = config.errorCount;
    dto.lastError = config.lastError;
    dto.lastErrorAt = config.lastErrorAt;
    dto.discoveryLastFetchedAt = config.discoveryLastFetchedAt;
    dto.createdAt = config.createdAt;
    dto.updatedAt = config.updatedAt;
    return dto;
  }
}
