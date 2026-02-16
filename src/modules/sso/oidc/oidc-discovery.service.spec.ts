import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { OidcDiscoveryService } from './oidc-discovery.service';
import { RedisService } from '../../redis/redis.service';
import { OIDC_CONSTANTS } from '../constants/oidc.constants';

describe('OidcDiscoveryService', () => {
  let service: OidcDiscoveryService;
  let httpService: HttpService;
  let redisService: RedisService;

  const mockDiscoveryDoc = {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token',
    userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
    end_session_endpoint: 'https://accounts.google.com/logout',
    response_types_supported: ['code'],
    scopes_supported: ['openid', 'email', 'profile'],
    id_token_signing_alg_values_supported: ['RS256'],
  };

  const mockJwksDoc = {
    keys: [
      {
        kty: 'RSA',
        kid: 'test-kid-1',
        use: 'sig',
        n: 'test-modulus',
        e: 'AQAB',
        alg: 'RS256',
      },
      {
        kty: 'RSA',
        kid: 'test-kid-2',
        use: 'sig',
        n: 'test-modulus-2',
        e: 'AQAB',
        alg: 'RS256',
      },
    ],
  };

  const discoveryUrl = 'https://accounts.google.com/.well-known/openid-configuration';
  const jwksUri = 'https://www.googleapis.com/oauth2/v3/certs';

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OidcDiscoveryService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<OidcDiscoveryService>(OidcDiscoveryService);
    httpService = module.get<HttpService>(HttpService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('fetchDiscoveryDocument', () => {
    it('should fetch and cache discovery document in Redis', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockHttpService.get.mockReturnValue(
        of({ data: mockDiscoveryDoc, status: 200 } as AxiosResponse),
      );
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.fetchDiscoveryDocument(discoveryUrl);

      expect(result).toEqual(mockDiscoveryDoc);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining(OIDC_CONSTANTS.DISCOVERY_CACHE_PREFIX),
        JSON.stringify(mockDiscoveryDoc),
        OIDC_CONSTANTS.DISCOVERY_CACHE_TTL_SECONDS,
      );
    });

    it('should return cached result on subsequent call', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockDiscoveryDoc));

      const result = await service.fetchDiscoveryDocument(discoveryUrl);

      expect(result).toEqual(mockDiscoveryDoc);
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('should fetch fresh result when forceRefresh=true', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockDiscoveryDoc));
      mockHttpService.get.mockReturnValue(
        of({ data: mockDiscoveryDoc, status: 200 } as AxiosResponse),
      );
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.fetchDiscoveryDocument(discoveryUrl, true);

      expect(result).toEqual(mockDiscoveryDoc);
      expect(mockHttpService.get).toHaveBeenCalled();
    });

    it('should throw on invalid discovery URL', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(
        service.fetchDiscoveryDocument('https://invalid.example.com/.well-known/openid-configuration'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate required field: issuer', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const invalidDoc = { ...mockDiscoveryDoc, issuer: undefined };
      mockHttpService.get.mockReturnValue(
        of({ data: invalidDoc, status: 200 } as AxiosResponse),
      );

      await expect(
        service.fetchDiscoveryDocument(discoveryUrl),
      ).rejects.toThrow('issuer');
    });

    it('should validate required field: authorization_endpoint', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const invalidDoc = { ...mockDiscoveryDoc, authorization_endpoint: undefined };
      mockHttpService.get.mockReturnValue(
        of({ data: invalidDoc, status: 200 } as AxiosResponse),
      );

      await expect(
        service.fetchDiscoveryDocument(discoveryUrl),
      ).rejects.toThrow('authorization_endpoint');
    });

    it('should validate required field: token_endpoint', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const invalidDoc = { ...mockDiscoveryDoc, token_endpoint: undefined };
      mockHttpService.get.mockReturnValue(
        of({ data: invalidDoc, status: 200 } as AxiosResponse),
      );

      await expect(
        service.fetchDiscoveryDocument(discoveryUrl),
      ).rejects.toThrow('token_endpoint');
    });

    it('should validate required field: jwks_uri', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const invalidDoc = { ...mockDiscoveryDoc, jwks_uri: undefined };
      mockHttpService.get.mockReturnValue(
        of({ data: invalidDoc, status: 200 } as AxiosResponse),
      );

      await expect(
        service.fetchDiscoveryDocument(discoveryUrl),
      ).rejects.toThrow('jwks_uri');
    });
  });

  describe('fetchJwks', () => {
    it('should fetch and cache JWKS in Redis', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockHttpService.get.mockReturnValue(
        of({ data: mockJwksDoc, status: 200 } as AxiosResponse),
      );
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.fetchJwks(jwksUri);

      expect(result).toEqual(mockJwksDoc);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining(OIDC_CONSTANTS.JWKS_CACHE_PREFIX),
        JSON.stringify(mockJwksDoc),
        OIDC_CONSTANTS.JWKS_CACHE_TTL_SECONDS,
      );
    });

    it('should return cached JWKS', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockJwksDoc));

      const result = await service.fetchJwks(jwksUri);

      expect(result).toEqual(mockJwksDoc);
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('should throw on missing keys array', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockHttpService.get.mockReturnValue(
        of({ data: { nokeys: true }, status: 200 } as AxiosResponse),
      );

      await expect(service.fetchJwks(jwksUri)).rejects.toThrow('keys array');
    });
  });

  describe('getSigningKey', () => {
    it('should find key by kid', async () => {
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockJwksDoc));

      const key = await service.getSigningKey(jwksUri, 'test-kid-1');

      expect(key.kid).toBe('test-kid-1');
    });

    it('should force-refresh cache on key miss (key rotation)', async () => {
      // First call returns cached JWKS without the target key
      const oldJwks = { keys: [{ kty: 'RSA', kid: 'old-kid', use: 'sig', n: 'x', e: 'AQAB' }] };
      const newJwks = {
        keys: [
          { kty: 'RSA', kid: 'old-kid', use: 'sig', n: 'x', e: 'AQAB' },
          { kty: 'RSA', kid: 'new-kid', use: 'sig', n: 'y', e: 'AQAB' },
        ],
      };

      mockRedisService.get
        .mockResolvedValueOnce(JSON.stringify(oldJwks)) // cached
        .mockResolvedValueOnce(null); // force refresh

      mockHttpService.get.mockReturnValue(
        of({ data: newJwks, status: 200 } as AxiosResponse),
      );
      mockRedisService.set.mockResolvedValue(undefined);

      const key = await service.getSigningKey(jwksUri, 'new-kid');

      expect(key.kid).toBe('new-kid');
      expect(mockHttpService.get).toHaveBeenCalled();
    });

    it('should throw when key not found after refresh', async () => {
      mockRedisService.get
        .mockResolvedValueOnce(JSON.stringify(mockJwksDoc))
        .mockResolvedValueOnce(null);

      mockHttpService.get.mockReturnValue(
        of({ data: mockJwksDoc, status: 200 } as AxiosResponse),
      );
      mockRedisService.set.mockResolvedValue(undefined);

      await expect(
        service.getSigningKey(jwksUri, 'nonexistent-kid'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
