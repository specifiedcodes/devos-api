import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { OIDC_CONSTANTS } from '../constants/oidc.constants';
import {
  OidcDiscoveryDocument,
  JwksDocument,
  JwksKey,
} from '../interfaces/oidc.interfaces';

@Injectable()
export class OidcDiscoveryService {
  private readonly logger = new Logger(OidcDiscoveryService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Fetch OIDC Discovery document, with Redis caching
   */
  async fetchDiscoveryDocument(
    discoveryUrl: string,
    forceRefresh = false,
  ): Promise<OidcDiscoveryDocument> {
    const cacheKey = `${OIDC_CONSTANTS.DISCOVERY_CACHE_PREFIX}${this.hashUrl(discoveryUrl)}`;

    // Check cache first
    if (!forceRefresh) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as OidcDiscoveryDocument;
        } catch {
          this.logger.warn('Failed to parse cached discovery document, fetching fresh');
        }
      }
    }

    // Fetch from URL
    try {
      const response = await firstValueFrom(
        this.httpService.get<OidcDiscoveryDocument>(discoveryUrl, {
          timeout: OIDC_CONSTANTS.HTTP_TIMEOUT_MS,
        }),
      );

      const doc = response.data;

      // Validate required fields
      if (!doc.issuer) {
        throw new BadRequestException('Discovery document missing required field: issuer');
      }
      if (!doc.authorization_endpoint) {
        throw new BadRequestException('Discovery document missing required field: authorization_endpoint');
      }
      if (!doc.token_endpoint) {
        throw new BadRequestException('Discovery document missing required field: token_endpoint');
      }
      if (!doc.jwks_uri) {
        throw new BadRequestException('Discovery document missing required field: jwks_uri');
      }

      // Cache in Redis
      await this.redisService.set(
        cacheKey,
        JSON.stringify(doc),
        OIDC_CONSTANTS.DISCOVERY_CACHE_TTL_SECONDS,
      );

      return doc;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to fetch discovery document from ${discoveryUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException(
        'Failed to fetch OIDC discovery document. Please verify the discovery URL is correct and accessible.',
      );
    }
  }

  /**
   * Fetch JWKS document, with Redis caching
   */
  async fetchJwks(jwksUri: string, forceRefresh = false): Promise<JwksDocument> {
    const cacheKey = `${OIDC_CONSTANTS.JWKS_CACHE_PREFIX}${this.hashUrl(jwksUri)}`;

    // Check cache first
    if (!forceRefresh) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as JwksDocument;
        } catch {
          this.logger.warn('Failed to parse cached JWKS, fetching fresh');
        }
      }
    }

    // Fetch from URL
    try {
      const response = await firstValueFrom(
        this.httpService.get<JwksDocument>(jwksUri, {
          timeout: OIDC_CONSTANTS.HTTP_TIMEOUT_MS,
        }),
      );

      const jwks = response.data;

      if (!jwks.keys || !Array.isArray(jwks.keys)) {
        throw new BadRequestException('JWKS document missing keys array');
      }

      // Cache in Redis
      await this.redisService.set(
        cacheKey,
        JSON.stringify(jwks),
        OIDC_CONSTANTS.JWKS_CACHE_TTL_SECONDS,
      );

      return jwks;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to fetch JWKS from ${jwksUri}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new BadRequestException('Failed to fetch JWKS. The JWKS URI may be unreachable.');
    }
  }

  /**
   * Get a specific signing key from JWKS by kid
   * Supports key rotation by retrying with force refresh
   */
  async getSigningKey(jwksUri: string, kid: string): Promise<JwksKey> {
    // Try cached JWKS first
    let jwks = await this.fetchJwks(jwksUri, false);
    let key = jwks.keys.find((k) => k.kid === kid);

    if (key) {
      return key;
    }

    // Key not found - force refresh (key rotation scenario)
    this.logger.warn(`Signing key ${kid} not found in cached JWKS, refreshing...`);
    jwks = await this.fetchJwks(jwksUri, true);
    key = jwks.keys.find((k) => k.kid === kid);

    if (!key) {
      throw new UnauthorizedException('Signing key not found');
    }

    return key;
  }

  /**
   * Hash a URL for cache key usage
   */
  private hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
  }
}
