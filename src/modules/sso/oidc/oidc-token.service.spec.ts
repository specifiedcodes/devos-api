import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { OidcTokenService } from './oidc-token.service';
import { OidcDiscoveryService } from './oidc-discovery.service';

// Generate RSA keys for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Extract n and e from public key for JWK
const publicKeyObj = crypto.createPublicKey(publicKey);
const jwk = publicKeyObj.export({ format: 'jwk' });

const testJwksKey = {
  kty: 'RSA',
  kid: 'test-kid',
  use: 'sig',
  n: (jwk as any).n,
  e: (jwk as any).e,
  alg: 'RS256',
};

function createTestIdToken(claims: Record<string, unknown>, kid = 'test-kid'): string {
  return jwt.sign(claims, privateKey, {
    algorithm: 'RS256',
    header: { kid, alg: 'RS256', typ: 'JWT' } as any,
  });
}

describe('OidcTokenService', () => {
  let service: OidcTokenService;

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockDiscoveryService = {
    getSigningKey: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OidcTokenService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: OidcDiscoveryService, useValue: mockDiscoveryService },
      ],
    }).compile();

    service = module.get<OidcTokenService>(OidcTokenService);
  });

  describe('exchangeCodeForTokens', () => {
    const baseParams = {
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      code: 'auth-code-123',
      redirectUri: 'http://localhost:3001/api/auth/oidc/ws-1/callback',
      clientId: 'client-123',
      clientSecret: 'secret-456',
      tokenEndpointAuthMethod: 'client_secret_post',
    };

    const mockTokenResponse = {
      access_token: 'access-token-123',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: 'id-token-123',
      scope: 'openid email profile',
    };

    it('should send correct POST body for client_secret_post', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: mockTokenResponse, status: 200 } as AxiosResponse),
      );

      await service.exchangeCodeForTokens(baseParams);

      const [url, body, config] = mockHttpService.post.mock.calls[0];
      expect(url).toBe(baseParams.tokenEndpoint);
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain(`code=${baseParams.code}`);
      expect(body).toContain(`client_id=${baseParams.clientId}`);
      expect(body).toContain(`client_secret=${baseParams.clientSecret}`);
      expect(config.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('should use Basic auth for client_secret_basic', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: mockTokenResponse, status: 200 } as AxiosResponse),
      );

      await service.exchangeCodeForTokens({
        ...baseParams,
        tokenEndpointAuthMethod: 'client_secret_basic',
      });

      const [, body, config] = mockHttpService.post.mock.calls[0];
      expect(body).not.toContain('client_secret=');
      expect(config.headers['Authorization']).toMatch(/^Basic /);
    });

    it('should include code_verifier when PKCE is used', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: mockTokenResponse, status: 200 } as AxiosResponse),
      );

      await service.exchangeCodeForTokens({
        ...baseParams,
        codeVerifier: 'test-verifier',
      });

      const [, body] = mockHttpService.post.mock.calls[0];
      expect(body).toContain('code_verifier=test-verifier');
    });

    it('should reject response without id_token', async () => {
      const badResponse = { ...mockTokenResponse, id_token: undefined };
      mockHttpService.post.mockReturnValue(
        of({ data: badResponse, status: 200 } as AxiosResponse),
      );

      await expect(service.exchangeCodeForTokens(baseParams)).rejects.toThrow(
        'id_token',
      );
    });

    it('should reject response without access_token', async () => {
      const badResponse = { ...mockTokenResponse, access_token: undefined };
      mockHttpService.post.mockReturnValue(
        of({ data: badResponse, status: 200 } as AxiosResponse),
      );

      await expect(service.exchangeCodeForTokens(baseParams)).rejects.toThrow(BadRequestException);
    });

    it('should throw on network error', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(service.exchangeCodeForTokens(baseParams)).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateIdToken', () => {
    const now = Math.floor(Date.now() / 1000);
    const validClaims = {
      iss: 'https://accounts.google.com',
      sub: 'user-123',
      aud: 'client-123',
      exp: now + 3600,
      iat: now,
      nonce: 'test-nonce',
      email: 'user@example.com',
    };

    it('should verify JWT signature with correct public key', async () => {
      const idToken = createTestIdToken(validClaims);
      mockDiscoveryService.getSigningKey.mockResolvedValue(testJwksKey);

      const result = await service.validateIdToken({
        idToken,
        jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
        issuer: 'https://accounts.google.com',
        clientId: 'client-123',
        nonce: 'test-nonce',
      });

      expect(result.iss).toBe('https://accounts.google.com');
      expect(result.email).toBe('user@example.com');
    });

    it('should reject token with wrong issuer', async () => {
      const idToken = createTestIdToken({ ...validClaims, iss: 'https://evil.com' });
      mockDiscoveryService.getSigningKey.mockResolvedValue(testJwksKey);

      await expect(
        service.validateIdToken({
          idToken,
          jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
          issuer: 'https://accounts.google.com',
          clientId: 'client-123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject token with wrong audience', async () => {
      const idToken = createTestIdToken({ ...validClaims, aud: 'wrong-client' });
      mockDiscoveryService.getSigningKey.mockResolvedValue(testJwksKey);

      await expect(
        service.validateIdToken({
          idToken,
          jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
          issuer: 'https://accounts.google.com',
          clientId: 'client-123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject expired token', async () => {
      const idToken = createTestIdToken({
        ...validClaims,
        exp: now - 600, // 10 min ago, beyond 5 min clock skew
        iat: now - 3600,
      });
      mockDiscoveryService.getSigningKey.mockResolvedValue(testJwksKey);

      await expect(
        service.validateIdToken({
          idToken,
          jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
          issuer: 'https://accounts.google.com',
          clientId: 'client-123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject token with wrong nonce', async () => {
      const idToken = createTestIdToken({ ...validClaims, nonce: 'wrong-nonce' });
      mockDiscoveryService.getSigningKey.mockResolvedValue(testJwksKey);

      await expect(
        service.validateIdToken({
          idToken,
          jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
          issuer: 'https://accounts.google.com',
          clientId: 'client-123',
          nonce: 'test-nonce',
        }),
      ).rejects.toThrow('nonce mismatch');
    });

    it('should handle key rotation (fetches fresh JWKS)', async () => {
      const idToken = createTestIdToken(validClaims);
      mockDiscoveryService.getSigningKey.mockResolvedValue(testJwksKey);

      const result = await service.validateIdToken({
        idToken,
        jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
        issuer: 'https://accounts.google.com',
        clientId: 'client-123',
        nonce: 'test-nonce',
      });

      expect(mockDiscoveryService.getSigningKey).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v3/certs',
        'test-kid',
      );
      expect(result.sub).toBe('user-123');
    });
  });

  describe('fetchUserInfo', () => {
    it('should send correct Authorization header', async () => {
      const userInfo = { sub: 'user-123', email: 'user@example.com' };
      mockHttpService.get.mockReturnValue(
        of({ data: userInfo, status: 200 } as AxiosResponse),
      );

      await service.fetchUserInfo('https://openidconnect.googleapis.com/v1/userinfo', 'access-token');

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://openidconnect.googleapis.com/v1/userinfo',
        expect.objectContaining({
          headers: { Authorization: 'Bearer access-token' },
        }),
      );
    });

    it('should handle error responses gracefully', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('UserInfo error')),
      );

      const result = await service.fetchUserInfo(
        'https://openidconnect.googleapis.com/v1/userinfo',
        'access-token',
      );

      // Should not throw, returns fallback
      expect(result).toEqual({ sub: '' });
    });
  });

  describe('generatePkceChallenge', () => {
    it('should produce valid S256 challenge', () => {
      const pkce = service.generatePkceChallenge();

      // Verify challenge matches verifier
      const expectedChallenge = crypto
        .createHash('sha256')
        .update(pkce.codeVerifier)
        .digest('base64url');

      expect(pkce.codeChallenge).toBe(expectedChallenge);
      expect(pkce.codeChallengeMethod).toBe('S256');
    });

    it('should produce verifier of correct length', () => {
      const pkce = service.generatePkceChallenge();

      // 64 bytes base64url encoded should be 86 chars
      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128);
    });

    it('should produce unique challenges on each call', () => {
      const pkce1 = service.generatePkceChallenge();
      const pkce2 = service.generatePkceChallenge();

      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
    });
  });

  describe('generateState', () => {
    it('should produce URL-safe random string', () => {
      const state = service.generateState();

      expect(state).toBeDefined();
      expect(state.length).toBeGreaterThan(0);
      // base64url: only alphanumeric, -, _
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should produce unique values', () => {
      const state1 = service.generateState();
      const state2 = service.generateState();
      expect(state1).not.toBe(state2);
    });
  });

  describe('generateNonce', () => {
    it('should produce URL-safe random string', () => {
      const nonce = service.generateNonce();

      expect(nonce).toBeDefined();
      expect(nonce.length).toBeGreaterThan(0);
      expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should produce unique values', () => {
      const nonce1 = service.generateNonce();
      const nonce2 = service.generateNonce();
      expect(nonce1).not.toBe(nonce2);
    });
  });
});
