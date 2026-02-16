export interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  response_types_supported: string[];
  scopes_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export interface OidcTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token: string;
  scope?: string;
}

export interface OidcIdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  at_hash?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  [key: string]: unknown;
}

export interface OidcUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  groups?: string[];
  [key: string]: unknown;
}

export interface OidcAuthorizationParams {
  redirectUrl: string;
  state: string;
  nonce: string;
  codeVerifier?: string;
}

export interface OidcCallbackResult {
  userId: string;
  email: string;
  isNewUser: boolean;
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  federatedSessionId?: string;
}

export interface JwksKey {
  kty: string;
  kid: string;
  use?: string;
  n?: string;
  e?: string;
  x5c?: string[];
  alg?: string;
}

export interface JwksDocument {
  keys: JwksKey[];
}

export interface PkceChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}
