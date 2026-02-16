import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { OidcDiscoveryService } from './oidc-discovery.service';
import { OIDC_CONSTANTS } from '../constants/oidc.constants';
import {
  OidcTokenResponse,
  OidcIdTokenClaims,
  OidcUserInfo,
  PkceChallenge,
  JwksKey,
} from '../interfaces/oidc.interfaces';

@Injectable()
export class OidcTokenService {
  private readonly logger = new Logger(OidcTokenService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly oidcDiscoveryService: OidcDiscoveryService,
  ) {}

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(params: {
    tokenEndpoint: string;
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
    codeVerifier?: string;
    tokenEndpointAuthMethod: string;
  }): Promise<OidcTokenResponse> {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', params.code);
    body.append('redirect_uri', params.redirectUri);

    // Include PKCE code_verifier if present
    if (params.codeVerifier) {
      body.append('code_verifier', params.codeVerifier);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Set client authentication based on method
    if (params.tokenEndpointAuthMethod === 'client_secret_basic') {
      const credentials = Buffer.from(
        `${encodeURIComponent(params.clientId)}:${encodeURIComponent(params.clientSecret)}`,
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else {
      // client_secret_post (default)
      body.append('client_id', params.clientId);
      body.append('client_secret', params.clientSecret);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<OidcTokenResponse>(params.tokenEndpoint, body.toString(), {
          headers,
          timeout: OIDC_CONSTANTS.HTTP_TIMEOUT_MS,
        }),
      );

      const tokenResponse = response.data;

      if (!tokenResponse.id_token) {
        throw new BadRequestException('Token response missing id_token');
      }
      if (!tokenResponse.access_token) {
        throw new BadRequestException('Token response missing access_token');
      }

      return tokenResponse;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Sanitize error to avoid leaking client_secret from Axios request config
      const safeMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Token exchange failed: ${safeMessage}`);
      throw new BadRequestException('Failed to exchange authorization code for tokens');
    }
  }

  /**
   * Validate an OIDC ID token JWT
   */
  async validateIdToken(params: {
    idToken: string;
    jwksUri: string;
    issuer: string;
    clientId: string;
    nonce?: string;
  }): Promise<OidcIdTokenClaims> {
    // Decode header to get kid and alg
    const decoded = jwt.decode(params.idToken, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new UnauthorizedException('Failed to decode ID token');
    }

    const { kid, alg } = decoded.header;
    if (!kid) {
      throw new UnauthorizedException('ID token header missing kid');
    }

    // Validate algorithm
    const supportedAlgs = ['RS256', 'RS384', 'RS512'];
    if (!supportedAlgs.includes(alg as string)) {
      throw new UnauthorizedException(`Unsupported signing algorithm: ${alg}`);
    }

    // Fetch signing key
    const jwksKey = await this.oidcDiscoveryService.getSigningKey(params.jwksUri, kid);

    // Convert JWK to PEM
    const publicKey = this.jwkToPem(jwksKey);

    // Verify token
    let claims: OidcIdTokenClaims;
    try {
      claims = jwt.verify(params.idToken, publicKey, {
        algorithms: [alg as jwt.Algorithm],
        issuer: params.issuer,
        audience: params.clientId,
        clockTolerance: OIDC_CONSTANTS.ID_TOKEN_CLOCK_SKEW_SECONDS,
      }) as OidcIdTokenClaims;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('ID token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException(`ID token validation failed: ${error.message}`);
      }
      throw new UnauthorizedException('ID token signature verification failed');
    }

    // Validate nonce if provided
    if (params.nonce && claims.nonce !== params.nonce) {
      throw new UnauthorizedException('ID token nonce mismatch');
    }

    return claims;
  }

  /**
   * Fetch UserInfo from the provider's userinfo endpoint
   */
  async fetchUserInfo(userinfoEndpoint: string, accessToken: string): Promise<OidcUserInfo> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<OidcUserInfo>(userinfoEndpoint, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: OIDC_CONSTANTS.HTTP_TIMEOUT_MS,
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.warn('Failed to fetch UserInfo', error);
      // UserInfo is supplementary, don't fail the flow
      return { sub: '' };
    }
  }

  /**
   * Generate PKCE challenge (RFC 7636)
   */
  generatePkceChallenge(): PkceChallenge {
    // Generate code_verifier (64 bytes -> base64url)
    const codeVerifier = crypto
      .randomBytes(OIDC_CONSTANTS.PKCE_VERIFIER_LENGTH)
      .toString('base64url');

    // Generate code_challenge = base64url(SHA256(code_verifier))
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: OIDC_CONSTANTS.PKCE_CHALLENGE_METHOD,
    };
  }

  /**
   * Generate cryptographically random state parameter (CSRF protection)
   */
  generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Generate cryptographically random nonce (replay protection)
   */
  generateNonce(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Convert JWK RSA key to PEM format
   */
  private jwkToPem(jwk: JwksKey): string {
    if (jwk.x5c && jwk.x5c.length > 0) {
      // Use x5c certificate if available
      return `-----BEGIN CERTIFICATE-----\n${jwk.x5c[0]}\n-----END CERTIFICATE-----`;
    }

    if (!jwk.n || !jwk.e) {
      throw new UnauthorizedException('JWK missing required RSA parameters (n, e)');
    }

    // Convert base64url-encoded modulus and exponent to PEM RSA public key
    const modulus = Buffer.from(jwk.n, 'base64url');
    const exponent = Buffer.from(jwk.e, 'base64url');

    // Build DER-encoded RSA public key
    const modulusEncoded = this.encodeDerInteger(modulus);
    const exponentEncoded = this.encodeDerInteger(exponent);

    const rsaPublicKey = this.encodeDerSequence(
      Buffer.concat([modulusEncoded, exponentEncoded]),
    );

    const algorithmIdentifier = this.encodeDerSequence(
      Buffer.concat([
        // RSA algorithm OID: 1.2.840.113549.1.1.1
        Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]),
        // NULL parameters
        Buffer.from([0x05, 0x00]),
      ]),
    );

    const bitString = Buffer.concat([
      Buffer.from([0x03]),
      this.encodeDerLength(rsaPublicKey.length + 1),
      Buffer.from([0x00]), // unused bits
      rsaPublicKey,
    ]);

    const publicKeyInfo = this.encodeDerSequence(
      Buffer.concat([algorithmIdentifier, bitString]),
    );

    const base64 = publicKeyInfo.toString('base64');
    const lines = base64.match(/.{1,64}/g) || [base64];
    return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
  }

  private encodeDerLength(length: number): Buffer {
    if (length < 0x80) {
      return Buffer.from([length]);
    }
    if (length < 0x100) {
      return Buffer.from([0x81, length]);
    }
    return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  }

  private encodeDerInteger(value: Buffer): Buffer {
    // Prepend 0x00 if high bit is set (to indicate positive integer)
    let data = value;
    if (data[0] >= 0x80) {
      data = Buffer.concat([Buffer.from([0x00]), data]);
    }
    return Buffer.concat([
      Buffer.from([0x02]),
      this.encodeDerLength(data.length),
      data,
    ]);
  }

  private encodeDerSequence(content: Buffer): Buffer {
    return Buffer.concat([
      Buffer.from([0x30]),
      this.encodeDerLength(content.length),
      content,
    ]);
  }
}
