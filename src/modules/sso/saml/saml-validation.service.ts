import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { SAML } from '@node-saml/node-saml';
import { SamlIdpConfig, SamlAssertionResult, SamlAttributes } from '../interfaces/saml.interfaces';
import { SAML_CONSTANTS } from '../constants/saml.constants';

@Injectable()
export class SamlValidationService {
  private readonly logger = new Logger(SamlValidationService.name);

  /**
   * Validate a SAML response and extract the assertion result
   */
  async validateSamlResponse(
    samlResponse: string,
    config: SamlIdpConfig,
    spEntityId: string,
    acsUrl: string,
    expectedRequestId?: string,
  ): Promise<SamlAssertionResult> {
    try {
      const saml = new SAML({
        callbackUrl: acsUrl,
        issuer: spEntityId,
        idpIssuer: config.entityId,
        idpCert: config.certificate,
        entryPoint: config.ssoUrl,
        wantAssertionsSigned: config.wantAssertionsSigned,
        wantAuthnResponseSigned: config.wantResponseSigned,
        audience: spEntityId,
        acceptedClockSkewMs: 300000, // 5 minutes
      });

      const { profile } = await saml.validatePostResponseAsync({
        SAMLResponse: samlResponse,
      });

      if (!profile) {
        throw new UnauthorizedException('SAML response validation failed: no profile returned');
      }

      // Validate InResponseTo if expectedRequestId is provided
      if (expectedRequestId && profile.inResponseTo !== expectedRequestId) {
        throw new UnauthorizedException(
          'SAML response InResponseTo does not match expected request ID',
        );
      }

      const attributes: SamlAttributes = {
        email: (profile.nameID as string) || '',
        firstName: undefined,
        lastName: undefined,
        groups: undefined,
      };

      // Extract attributes from profile
      if (profile) {
        const profileAny = profile as Record<string, unknown>;
        // Map common attribute names
        if (profileAny['email']) attributes.email = profileAny['email'] as string;
        if (profileAny['firstName']) attributes.firstName = profileAny['firstName'] as string;
        if (profileAny['lastName']) attributes.lastName = profileAny['lastName'] as string;
        if (profileAny['groups']) {
          const groups = profileAny['groups'];
          attributes.groups = Array.isArray(groups) ? groups : [groups as string];
        }
      }

      return {
        nameId: profile.nameID as string,
        nameIdFormat: (profile.nameIDFormat as string) || SAML_CONSTANTS.DEFAULT_NAME_ID_FORMAT,
        sessionIndex: profile.sessionIndex as string | undefined,
        attributes,
        issuer: profile.issuer as string,
        inResponseTo: profile.inResponseTo as string | undefined,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error('SAML response validation failed', error);
      throw new UnauthorizedException(
        `SAML response validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Extract and map attributes from a SAML assertion using the configured attribute mapping
   */
  extractAttributes(
    profileAttributes: Record<string, unknown>,
    attributeMapping: Record<string, string>,
  ): SamlAttributes {
    const attributes: SamlAttributes = {
      email: '',
    };

    // Map each configured attribute
    for (const [devosField, idpAttribute] of Object.entries(attributeMapping)) {
      const value = profileAttributes[idpAttribute];
      if (value !== undefined && value !== null) {
        if (devosField === 'groups') {
          attributes.groups = Array.isArray(value) ? value.map(String) : [String(value)];
        } else {
          (attributes as Record<string, unknown>)[devosField] = String(value);
        }
      }
    }

    // Fallback: if email not mapped, use NameID
    if (!attributes.email && profileAttributes['nameID']) {
      attributes.email = String(profileAttributes['nameID']);
    }

    return attributes;
  }

  /**
   * Validate time conditions on a SAML assertion
   */
  validateTimeConditions(
    notBefore?: Date,
    notOnOrAfter?: Date,
    clockSkewMs: number = 300000,
  ): void {
    const now = Date.now();

    if (notBefore) {
      const notBeforeMs = new Date(notBefore).getTime() - clockSkewMs;
      if (now < notBeforeMs) {
        throw new UnauthorizedException('SAML assertion is not yet valid (NotBefore condition)');
      }
    }

    if (notOnOrAfter) {
      const notOnOrAfterMs = new Date(notOnOrAfter).getTime() + clockSkewMs;
      if (now >= notOnOrAfterMs) {
        throw new UnauthorizedException('SAML assertion has expired (NotOnOrAfter condition)');
      }
    }
  }

  /**
   * Validate audience restriction
   */
  validateAudienceRestriction(audiences: string[], expectedEntityId: string): void {
    if (!audiences || audiences.length === 0) {
      throw new UnauthorizedException('SAML assertion has no audience restriction');
    }

    if (!audiences.includes(expectedEntityId)) {
      throw new UnauthorizedException(
        `SAML assertion audience does not match SP entity ID. Expected: ${expectedEntityId}`,
      );
    }
  }
}
