import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { SAML } from '@node-saml/node-saml';
import { SamlConfigService } from './saml-config.service';
import { SamlValidationService } from './saml-validation.service';
import { SsoAuditService } from '../sso-audit.service';
import { SsoAuditEventType } from '../../../database/entities/sso-audit-event.entity';
import { AuthService } from '../../auth/auth.service';
import { RedisService } from '../../redis/redis.service';
import { JitProvisioningService } from '../jit/jit-provisioning.service';
import { SamlMetadataResponseDto } from '../dto/saml-metadata-response.dto';
import {
  SamlAuthnRequestResult,
  SamlCallbackResult,
  SamlIdpConfig,
} from '../interfaces/saml.interfaces';
import { SAML_CONSTANTS } from '../constants/saml.constants';
import { SessionFederationService } from '../session/session-federation.service';
import { SsoProviderType } from '../../../database/entities/sso-federated-session.entity';

@Injectable()
export class SamlService {
  private readonly logger = new Logger(SamlService.name);
  private readonly appUrl: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly samlConfigService: SamlConfigService,
    private readonly samlValidationService: SamlValidationService,
    private readonly ssoAuditService: SsoAuditService,
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly jitProvisioningService: JitProvisioningService,
    private readonly sessionFederationService: SessionFederationService,
  ) {
    this.appUrl = this.configService.get<string>('APP_URL', 'http://localhost:3001');
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  /**
   * Escape XML special characters in attribute values and text content
   */
  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Generate SP metadata for IdP configuration
   */
  async generateSpMetadata(
    workspaceId: string,
    configId: string,
  ): Promise<SamlMetadataResponseDto> {
    const config = await this.samlConfigService.getConfig(workspaceId, configId);

    const entityId = this.getSpEntityId(workspaceId);
    const acsUrl = this.getAcsUrl(workspaceId);
    const sloUrl = this.getSloUrl(workspaceId);
    const nameIdFormat = config.nameIdFormat || SAML_CONSTANTS.DEFAULT_NAME_ID_FORMAT;

    const metadataXml = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor entityID="${this.escapeXml(entityId)}"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <SPSSODescriptor AuthnRequestsSigned="false"
    WantAssertionsSigned="${config.wantAssertionsSigned}"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>${this.escapeXml(nameIdFormat)}</NameIDFormat>
    <AssertionConsumerService
      Binding="${SAML_CONSTANTS.BINDINGS.HTTP_POST}"
      Location="${this.escapeXml(acsUrl)}"
      index="1" isDefault="true"/>
    <SingleLogoutService
      Binding="${SAML_CONSTANTS.BINDINGS.HTTP_POST}"
      Location="${this.escapeXml(sloUrl)}"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

    const dto = new SamlMetadataResponseDto();
    dto.entityId = entityId;
    dto.acsUrl = acsUrl;
    dto.sloUrl = sloUrl;
    dto.nameIdFormat = nameIdFormat;
    dto.metadataXml = metadataXml;

    return dto;
  }

  /**
   * Initiate SAML login (SP-Initiated SSO)
   */
  async initiateLogin(
    workspaceId: string,
    configId: string,
    relayState?: string,
  ): Promise<SamlAuthnRequestResult> {
    const decryptedConfig = await this.samlConfigService.getDecryptedConfig(workspaceId, configId);

    if (!decryptedConfig.isActive) {
      throw new BadRequestException('SAML configuration is not active');
    }

    const spEntityId = this.getSpEntityId(workspaceId);
    const acsUrl = this.getAcsUrl(workspaceId);
    const requestId = `_${uuidv4()}`;

    const saml = new SAML({
      callbackUrl: acsUrl,
      issuer: spEntityId,
      idpIssuer: decryptedConfig.entityId,
      idpCert: decryptedConfig.decryptedCertificate,
      entryPoint: decryptedConfig.ssoUrl,
      wantAssertionsSigned: decryptedConfig.wantAssertionsSigned,
      wantAuthnResponseSigned: decryptedConfig.wantResponseSigned,
    });

    const authorizeUrl = await saml.getAuthorizeUrlAsync(
      relayState || '',
      undefined,
      {},
    );

    // Store request context in Redis with 5 min TTL
    await this.redisService.set(
      `${SAML_CONSTANTS.RELAY_STATE_PREFIX}${requestId}`,
      JSON.stringify({ workspaceId, configId }),
      SAML_CONSTANTS.RELAY_STATE_TTL_SECONDS,
    );

    return {
      redirectUrl: authorizeUrl,
      requestId,
      relayState,
    };
  }

  /**
   * Handle SAML callback (ACS endpoint)
   */
  async handleCallback(
    workspaceId: string,
    samlResponse: string,
    relayState?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SamlCallbackResult> {
    // Find active configs for workspace
    const activeConfigs = await this.samlConfigService.findActiveConfigsForWorkspace(workspaceId);

    if (!activeConfigs || activeConfigs.length === 0) {
      throw new BadRequestException('No active SAML configuration found for this workspace');
    }

    // Use the first active config (or match via relay state in multi-IdP scenarios)
    const config = activeConfigs[0];
    let decryptedCert: string;

    try {
      const decrypted = await this.samlConfigService.getDecryptedConfig(workspaceId, config.id);
      decryptedCert = decrypted.decryptedCertificate;
    } catch (error) {
      this.logger.error('Failed to decrypt SAML certificate', error);
      throw new InternalServerErrorException('Failed to process SAML configuration');
    }

    const spEntityId = this.getSpEntityId(workspaceId);
    const acsUrl = this.getAcsUrl(workspaceId);

    const idpConfig: SamlIdpConfig = {
      entityId: config.entityId,
      ssoUrl: config.ssoUrl,
      sloUrl: config.sloUrl || undefined,
      certificate: decryptedCert,
      nameIdFormat: config.nameIdFormat,
      wantAssertionsSigned: config.wantAssertionsSigned,
      wantResponseSigned: config.wantResponseSigned,
      authnContext: config.authnContext || undefined,
    };

    // Validate the SAML response
    const assertionResult = await this.samlValidationService.validateSamlResponse(
      samlResponse,
      idpConfig,
      spEntityId,
      acsUrl,
    );

    // Extract attributes using configured mapping
    const attributes = this.samlValidationService.extractAttributes(
      assertionResult.attributes as unknown as Record<string, unknown>,
      config.attributeMapping,
    );

    const email = attributes.email || assertionResult.nameId;
    if (!email) {
      await this.samlConfigService.updateErrorStats(config.id, 'Email attribute missing from assertion');
      void this.ssoAuditService.logEvent({
        workspaceId,
        eventType: SsoAuditEventType.SAML_LOGIN_FAILURE,
        samlConfigId: config.id,
        ipAddress,
        userAgent,
        details: { error: 'Email attribute missing from assertion' },
      });
      throw new BadRequestException('Email attribute is missing from SAML assertion');
    }

    // Centralized JIT Provisioning
    const provisioningResult = await this.jitProvisioningService.provisionUser(
      workspaceId,
      { ...attributes, ...(assertionResult.attributes as Record<string, unknown>) },
      'saml',
      ipAddress,
      userAgent,
    );
    const user = { id: provisioningResult.user.id, email: provisioningResult.user.email };
    const isNewUser = provisioningResult.isNewUser;

    // Generate JWT tokens via AuthService
    const authResponse = await this.authService.generateTokensForSsoUser(
      user as any,
      workspaceId,
      ipAddress,
      userAgent,
    );

    // Update SAML config stats
    await this.samlConfigService.updateLoginStats(config.id);

    // Log success audit event
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SAML_LOGIN_SUCCESS,
      targetUserId: user.id,
      samlConfigId: config.id,
      ipAddress,
      userAgent,
      details: {
        isNewUser,
        email,
        idpEntityId: assertionResult.issuer,
      },
    });

    // Create federated session linking SSO provider session with DevOS session
    let federatedSessionId: string | undefined;
    try {
      const timeoutConfig = await this.sessionFederationService.getWorkspaceTimeoutConfig(workspaceId);
      const federatedSession = await this.sessionFederationService.createFederatedSession({
        userId: user.id,
        workspaceId,
        providerType: SsoProviderType.SAML,
        providerConfigId: config.id,
        idpSessionId: assertionResult.sessionIndex,
        devosSessionId: authResponse.accessTokenJti || authResponse.tokens.access_token.substring(0, 36),
        accessTokenJti: authResponse.accessTokenJti,
        refreshTokenJti: authResponse.refreshTokenJti,
        sessionTimeoutMinutes: timeoutConfig.sessionTimeoutMinutes,
        idleTimeoutMinutes: timeoutConfig.idleTimeoutMinutes,
      });
      federatedSessionId = federatedSession.id;
    } catch (error) {
      this.logger.error('Failed to create federated session', error);
      // Non-blocking: SSO login still succeeds even if federation tracking fails
    }

    return {
      userId: user.id,
      email: user.email,
      isNewUser,
      workspaceId,
      accessToken: authResponse.tokens.access_token,
      refreshToken: authResponse.tokens.refresh_token,
      samlSessionIndex: assertionResult.sessionIndex,
      federatedSessionId,
    };
  }

  /**
   * Handle SAML logout (SLO)
   */
  async handleLogout(
    workspaceId: string,
    samlResponse?: string,
    samlRequest?: string,
  ): Promise<{ redirectUrl?: string }> {
    if (samlRequest) {
      // IdP-initiated SLO
      this.logger.log(`Processing IdP-initiated SLO for workspace ${workspaceId}`);

      // Extract SessionIndex from SAML LogoutRequest and terminate linked federated session
      try {
        // Parse the base64-decoded SAML request to extract SessionIndex
        const decodedRequest = Buffer.from(samlRequest, 'base64').toString('utf8');
        const sessionIndexMatch = decodedRequest.match(/SessionIndex="([^"]+)"/);
        if (sessionIndexMatch && sessionIndexMatch[1]) {
          await this.sessionFederationService.handleIdpLogout(sessionIndexMatch[1]);
          this.logger.log(`IdP logout processed for SessionIndex: ${sessionIndexMatch[1]}`);
        }
      } catch (error) {
        this.logger.error('Failed to process IdP-initiated logout', error);
      }

      return { redirectUrl: `${this.frontendUrl}/auth/login` };
    }

    // SP-initiated SLO
    const activeConfigs = await this.samlConfigService.findActiveConfigsForWorkspace(workspaceId);
    if (activeConfigs.length > 0 && activeConfigs[0].sloUrl) {
      return { redirectUrl: activeConfigs[0].sloUrl };
    }

    return { redirectUrl: `${this.frontendUrl}/auth/login` };
  }

  /**
   * Test SAML connection
   */
  async testConnection(
    workspaceId: string,
    configId: string,
    actorId: string,
  ): Promise<SamlAuthnRequestResult> {
    // For testing, we initiate a login but mark the relay state as "test"
    const decryptedConfig = await this.samlConfigService.getDecryptedConfig(workspaceId, configId);

    const spEntityId = this.getSpEntityId(workspaceId);
    const acsUrl = this.getAcsUrl(workspaceId);
    const requestId = `_${uuidv4()}`;

    const saml = new SAML({
      callbackUrl: acsUrl,
      issuer: spEntityId,
      idpIssuer: decryptedConfig.entityId,
      idpCert: decryptedConfig.decryptedCertificate,
      entryPoint: decryptedConfig.ssoUrl,
      wantAssertionsSigned: decryptedConfig.wantAssertionsSigned,
      wantAuthnResponseSigned: decryptedConfig.wantResponseSigned,
    });

    const authorizeUrl = await saml.getAuthorizeUrlAsync('test', undefined, {});

    // Store request context as "test" in Redis
    await this.redisService.set(
      `${SAML_CONSTANTS.RELAY_STATE_PREFIX}${requestId}`,
      JSON.stringify({ workspaceId, configId, isTest: true, actorId }),
      SAML_CONSTANTS.RELAY_STATE_TTL_SECONDS,
    );

    // Log test initiated (not success - success is logged on callback completion)
    void this.ssoAuditService.logEvent({
      workspaceId,
      eventType: SsoAuditEventType.SAML_CONFIG_UPDATED,
      actorId,
      samlConfigId: configId,
      details: { testInitiated: true },
    });

    return {
      redirectUrl: authorizeUrl,
      requestId,
      relayState: 'test',
    };
  }

  /**
   * Get the frontend redirect URL for successful SSO callback.
   * Uses URL fragment (#) instead of query params to prevent tokens from
   * appearing in server logs, referrer headers, and browser history entries.
   */
  getSuccessRedirectUrl(accessToken: string, refreshToken: string): string {
    return `${this.frontendUrl}/auth/sso/callback#token=${encodeURIComponent(accessToken)}&refresh=${encodeURIComponent(refreshToken)}`;
  }

  /**
   * Get the frontend redirect URL for SSO error
   */
  getErrorRedirectUrl(errorCode: string): string {
    return `${this.frontendUrl}/auth/sso/error?code=${encodeURIComponent(errorCode)}`;
  }

  private getSpEntityId(workspaceId: string): string {
    const prefix = this.configService.get<string>('SAML_SP_ENTITY_ID_PREFIX', 'https://devos.com/saml');
    return `${prefix}/${workspaceId}`;
  }

  private getAcsUrl(workspaceId: string): string {
    return `${this.appUrl}/api/auth/saml/${workspaceId}/callback`;
  }

  private getSloUrl(workspaceId: string): string {
    return `${this.appUrl}/api/auth/saml/${workspaceId}/logout`;
  }
}
