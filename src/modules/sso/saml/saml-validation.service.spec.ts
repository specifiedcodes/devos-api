import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { SamlValidationService } from './saml-validation.service';

// Mock @node-saml/node-saml
jest.mock('@node-saml/node-saml', () => ({
  SAML: jest.fn().mockImplementation(() => ({
    validatePostResponseAsync: jest.fn(),
  })),
}));

import { SAML } from '@node-saml/node-saml';

describe('SamlValidationService', () => {
  let service: SamlValidationService;

  const mockIdpConfig = {
    entityId: 'https://idp.example.com',
    ssoUrl: 'https://idp.example.com/sso',
    certificate: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    wantAssertionsSigned: true,
    wantResponseSigned: true,
  };

  const mockSpEntityId = 'https://devos.com/saml/workspace-123';
  const mockAcsUrl = 'https://devos.com/api/auth/saml/workspace-123/callback';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SamlValidationService],
    }).compile();

    service = module.get<SamlValidationService>(SamlValidationService);
  });

  describe('validateSamlResponse', () => {
    it('should accept valid signed SAML response', async () => {
      const mockProfile = {
        nameID: 'user@example.com',
        nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        sessionIndex: '_session123',
        issuer: 'https://idp.example.com',
        inResponseTo: '_req123',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const mockSamlInstance = {
        validatePostResponseAsync: jest.fn().mockResolvedValue({ profile: mockProfile }),
      };
      (SAML as jest.Mock).mockImplementation(() => mockSamlInstance);

      const result = await service.validateSamlResponse(
        'base64SAMLResponse',
        mockIdpConfig,
        mockSpEntityId,
        mockAcsUrl,
      );

      expect(result.nameId).toBe('user@example.com');
      expect(result.issuer).toBe('https://idp.example.com');
      expect(result.attributes.email).toBe('user@example.com');
      expect(result.attributes.firstName).toBe('John');
      expect(result.attributes.lastName).toBe('Doe');
    });

    it('should reject response with invalid signature', async () => {
      const mockSamlInstance = {
        validatePostResponseAsync: jest.fn().mockRejectedValue(new Error('Invalid signature')),
      };
      (SAML as jest.Mock).mockImplementation(() => mockSamlInstance);

      await expect(
        service.validateSamlResponse('invalidResponse', mockIdpConfig, mockSpEntityId, mockAcsUrl),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject response with no profile', async () => {
      const mockSamlInstance = {
        validatePostResponseAsync: jest.fn().mockResolvedValue({ profile: null }),
      };
      (SAML as jest.Mock).mockImplementation(() => mockSamlInstance);

      await expect(
        service.validateSamlResponse('samlResponse', mockIdpConfig, mockSpEntityId, mockAcsUrl),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject mismatched InResponseTo', async () => {
      const mockProfile = {
        nameID: 'user@example.com',
        nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        issuer: 'https://idp.example.com',
        inResponseTo: '_different_request_id',
      };

      const mockSamlInstance = {
        validatePostResponseAsync: jest.fn().mockResolvedValue({ profile: mockProfile }),
      };
      (SAML as jest.Mock).mockImplementation(() => mockSamlInstance);

      await expect(
        service.validateSamlResponse(
          'samlResponse',
          mockIdpConfig,
          mockSpEntityId,
          mockAcsUrl,
          '_expected_request_id',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('extractAttributes', () => {
    it('should map Okta-style attributes correctly', () => {
      const profileAttrs = {
        'email': 'user@example.com',
        'firstName': 'John',
        'lastName': 'Doe',
        'groups': ['admin', 'developers'],
      };
      const mapping = {
        email: 'email',
        firstName: 'firstName',
        lastName: 'lastName',
        groups: 'groups',
      };

      const result = service.extractAttributes(profileAttrs, mapping);

      expect(result.email).toBe('user@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.groups).toEqual(['admin', 'developers']);
    });

    it('should map Azure AD-style attributes correctly', () => {
      const profileAttrs = {
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'user@azure.com',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname': 'Jane',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname': 'Smith',
      };
      const mapping = {
        email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
        firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
        lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      };

      const result = service.extractAttributes(profileAttrs, mapping);

      expect(result.email).toBe('user@azure.com');
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
    });

    it('should fall back to NameID for email', () => {
      const profileAttrs = {
        nameID: 'fallback@example.com',
      };
      const mapping = {
        email: 'nonExistentAttr',
      };

      const result = service.extractAttributes(profileAttrs, mapping);

      expect(result.email).toBe('fallback@example.com');
    });

    it('should handle missing optional attributes gracefully', () => {
      const profileAttrs = {
        email: 'user@example.com',
      };
      const mapping = {
        email: 'email',
        firstName: 'firstName',
        lastName: 'lastName',
        groups: 'groups',
      };

      const result = service.extractAttributes(profileAttrs, mapping);

      expect(result.email).toBe('user@example.com');
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
      expect(result.groups).toBeUndefined();
    });

    it('should convert single group string to array', () => {
      const profileAttrs = {
        email: 'user@example.com',
        groups: 'single-group',
      };
      const mapping = {
        email: 'email',
        groups: 'groups',
      };

      const result = service.extractAttributes(profileAttrs, mapping);

      expect(result.groups).toEqual(['single-group']);
    });
  });

  describe('validateTimeConditions', () => {
    it('should accept valid time window', () => {
      const now = new Date();
      const notBefore = new Date(now.getTime() - 60000); // 1 min ago
      const notOnOrAfter = new Date(now.getTime() + 60000); // 1 min from now

      expect(() => service.validateTimeConditions(notBefore, notOnOrAfter)).not.toThrow();
    });

    it('should reject expired assertions', () => {
      const notOnOrAfter = new Date(Date.now() - 600000); // 10 min ago (beyond 5 min skew)

      expect(() => service.validateTimeConditions(undefined, notOnOrAfter)).toThrow(
        UnauthorizedException,
      );
    });

    it('should reject assertions not yet valid', () => {
      const notBefore = new Date(Date.now() + 600000); // 10 min from now (beyond 5 min skew)

      expect(() => service.validateTimeConditions(notBefore, undefined)).toThrow(
        UnauthorizedException,
      );
    });

    it('should handle clock skew tolerance', () => {
      // NotBefore is 3 minutes in the future - should be OK with 5 min skew
      const notBefore = new Date(Date.now() + 180000);

      expect(() => service.validateTimeConditions(notBefore, undefined, 300000)).not.toThrow();
    });

    it('should accept when no time conditions provided', () => {
      expect(() => service.validateTimeConditions(undefined, undefined)).not.toThrow();
    });
  });

  describe('validateAudienceRestriction', () => {
    it('should accept matching audience', () => {
      expect(() =>
        service.validateAudienceRestriction(
          ['https://devos.com/saml/workspace-123'],
          'https://devos.com/saml/workspace-123',
        ),
      ).not.toThrow();
    });

    it('should reject empty audience list', () => {
      expect(() =>
        service.validateAudienceRestriction([], 'https://devos.com/saml/workspace-123'),
      ).toThrow(UnauthorizedException);
    });

    it('should reject mismatched audience', () => {
      expect(() =>
        service.validateAudienceRestriction(
          ['https://other.com/saml/123'],
          'https://devos.com/saml/workspace-123',
        ),
      ).toThrow(UnauthorizedException);
    });

    it('should accept if any audience matches', () => {
      expect(() =>
        service.validateAudienceRestriction(
          ['https://other.com', 'https://devos.com/saml/workspace-123'],
          'https://devos.com/saml/workspace-123',
        ),
      ).not.toThrow();
    });
  });
});
