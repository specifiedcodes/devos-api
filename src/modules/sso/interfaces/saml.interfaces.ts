export interface SamlSpMetadata {
  entityId: string;
  acsUrl: string;
  sloUrl: string;
  nameIdFormat: string;
  wantAssertionsSigned: boolean;
  signingCertificate?: string;
}

export interface SamlIdpConfig {
  entityId: string;
  ssoUrl: string;
  sloUrl?: string;
  certificate: string;
  nameIdFormat: string;
  wantAssertionsSigned: boolean;
  wantResponseSigned: boolean;
  authnContext?: string;
}

export interface SamlAssertionResult {
  nameId: string;
  nameIdFormat: string;
  sessionIndex?: string;
  attributes: SamlAttributes;
  issuer: string;
  inResponseTo?: string;
  notBefore?: Date;
  notOnOrAfter?: Date;
}

export interface SamlAttributes {
  email: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  [key: string]: string | string[] | undefined;
}

export interface SamlAuthnRequestResult {
  redirectUrl: string;
  requestId: string;
  relayState?: string;
}

export interface SamlCallbackResult {
  userId: string;
  email: string;
  isNewUser: boolean;
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  samlSessionIndex?: string;
}

export interface ParsedIdpMetadata {
  entityId: string;
  ssoUrl: string;
  sloUrl?: string;
  certificate: string;
  nameIdFormat?: string;
}

export interface CertificateInfo {
  fingerprint: string;
  expiresAt: Date;
  subject: string;
  issuer: string;
  serialNumber: string;
}
