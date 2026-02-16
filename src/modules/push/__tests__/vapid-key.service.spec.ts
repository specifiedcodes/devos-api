/**
 * VapidKeyService Tests
 * Story 16.7: VAPID Key Web Push Setup
 *
 * Tests for VAPID key generation, validation, and rotation support.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { VapidKeyService } from '../services/vapid-key.service';

// Mock web-push
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  generateVAPIDKeys: jest.fn(),
}));

// Generate realistic-length VAPID keys for testing
const VALID_PUBLIC_KEY = 'BNxRk3rAv2yMGmpMm0YxEP1Y9s5YMhH-fGZb3WpHgVfKJNr-T5qLFZ5cDj8kZkK1pYHvh8dVQIwAnHfnQmGMrw';
const VALID_PRIVATE_KEY = 'd3VfLTZ0Y2tIdXJFTHhxMFVfS1FYYkFOeUxNQ3dGWjg';

const mockConfigService = (overrides: Record<string, any> = {}) => ({
  get: jest.fn((key: string, defaultValue?: any) => {
    const config: Record<string, any> = {
      VAPID_PUBLIC_KEY: VALID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: VALID_PRIVATE_KEY,
      VAPID_SUBJECT: 'mailto:admin@devos.app',
      ...overrides,
    };
    return config[key] ?? defaultValue;
  }),
});

describe('VapidKeyService', () => {
  let service: VapidKeyService;
  let configService: jest.Mocked<ConfigService>;

  const createService = async (configOverrides: Record<string, any> = {}) => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VapidKeyService,
        {
          provide: ConfigService,
          useFactory: () => mockConfigService(configOverrides),
        },
      ],
    }).compile();

    service = module.get<VapidKeyService>(VapidKeyService);
    configService = module.get(ConfigService);
    return { service, configService };
  };

  describe('initialization', () => {
    it('should configure VAPID keys successfully when valid env vars present', async () => {
      await createService();
      service.onModuleInit();

      expect(webPush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@devos.app',
        VALID_PUBLIC_KEY,
        VALID_PRIVATE_KEY,
      );
    });

    it('should report as enabled when properly configured', async () => {
      await createService();
      service.onModuleInit();

      expect(service.isEnabled()).toBe(true);
    });

    it('should return public key when configured', async () => {
      await createService();
      service.onModuleInit();

      expect(service.getPublicKey()).toBe(VALID_PUBLIC_KEY);
    });

    it('should warn and remain disabled when VAPID_PUBLIC_KEY missing', async () => {
      await createService({ VAPID_PUBLIC_KEY: undefined });
      service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
      expect(service.getPublicKey()).toBeNull();
      expect(webPush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('should warn and remain disabled when VAPID_PRIVATE_KEY missing', async () => {
      await createService({ VAPID_PRIVATE_KEY: undefined });
      service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
      expect(service.getPublicKey()).toBeNull();
      expect(webPush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('should error and remain disabled when public key format invalid', async () => {
      await createService({ VAPID_PUBLIC_KEY: 'short-invalid' });
      service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
      expect(webPush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('should error and remain disabled when private key format invalid', async () => {
      await createService({ VAPID_PRIVATE_KEY: 'short-invalid' });
      service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
      expect(webPush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('should error when VAPID_SUBJECT does not start with mailto:', async () => {
      await createService({ VAPID_SUBJECT: 'https://not-mailto.com' });
      service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
      expect(webPush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('should use default subject when VAPID_SUBJECT not set', async () => {
      await createService({ VAPID_SUBJECT: undefined });
      service.onModuleInit();

      expect(webPush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@devos.app',
        VALID_PUBLIC_KEY,
        VALID_PRIVATE_KEY,
      );
    });

    it('should handle webPush.setVapidDetails throwing an error', async () => {
      await createService();
      (webPush.setVapidDetails as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid VAPID details');
      });

      service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('validateKeyFormat', () => {
    beforeEach(async () => {
      await createService();
    });

    it('should validate URL-safe base64 format correctly (valid cases)', () => {
      expect(service.validateKeyFormat(VALID_PUBLIC_KEY, 'public')).toBe(true);
      expect(service.validateKeyFormat(VALID_PRIVATE_KEY, 'private')).toBe(true);
    });

    it('should reject keys with non-base64 characters', () => {
      const invalidKey = VALID_PUBLIC_KEY.replace('A', '!');
      expect(service.validateKeyFormat(invalidKey, 'public')).toBe(false);
    });

    it('should reject public keys that are too short', () => {
      expect(service.validateKeyFormat('AAAA', 'public')).toBe(false);
    });

    it('should reject public keys that are too long', () => {
      const tooLong = 'A'.repeat(101);
      expect(service.validateKeyFormat(tooLong, 'public')).toBe(false);
    });

    it('should reject private keys that are too short', () => {
      expect(service.validateKeyFormat('AAAA', 'private')).toBe(false);
    });

    it('should reject private keys that are too long', () => {
      const tooLong = 'A'.repeat(51);
      expect(service.validateKeyFormat(tooLong, 'private')).toBe(false);
    });

    it('should reject null/undefined keys', () => {
      expect(service.validateKeyFormat(null as any, 'public')).toBe(false);
      expect(service.validateKeyFormat(undefined as any, 'private')).toBe(false);
    });

    it('should reject non-string keys', () => {
      expect(service.validateKeyFormat(123 as any, 'public')).toBe(false);
    });
  });

  describe('generateKeyPair', () => {
    it('should generate valid key pair via generateKeyPair()', async () => {
      await createService();
      (webPush.generateVAPIDKeys as jest.Mock).mockReturnValue({
        publicKey: 'generated-public-key',
        privateKey: 'generated-private-key',
      });

      const result = service.generateKeyPair();

      expect(webPush.generateVAPIDKeys).toHaveBeenCalled();
      expect(result).toEqual({
        publicKey: 'generated-public-key',
        privateKey: 'generated-private-key',
      });
    });

    it('each invocation produces different key pairs', async () => {
      await createService();
      let callCount = 0;
      (webPush.generateVAPIDKeys as jest.Mock).mockImplementation(() => {
        callCount++;
        return {
          publicKey: `public-key-${callCount}`,
          privateKey: `private-key-${callCount}`,
        };
      });

      const pair1 = service.generateKeyPair();
      const pair2 = service.generateKeyPair();

      expect(pair1.publicKey).not.toBe(pair2.publicKey);
      expect(pair1.privateKey).not.toBe(pair2.privateKey);
    });
  });

  describe('getKeyStatus', () => {
    it('should return correct key status when configured', async () => {
      await createService();
      service.onModuleInit();

      const status = service.getKeyStatus();

      expect(status).toEqual({
        configured: true,
        publicKeyPresent: true,
        privateKeyPresent: true,
        subjectConfigured: true,
        publicKeyPrefix: VALID_PUBLIC_KEY.substring(0, 8),
        subject: 'mailto:a***n@d***s.app',
        keyFormat: 'valid',
        lastRotatedAt: undefined,
      });
    });

    it('should return correct key status when not configured', async () => {
      await createService({
        VAPID_PUBLIC_KEY: undefined,
        VAPID_PRIVATE_KEY: undefined,
      });
      service.onModuleInit();

      const status = service.getKeyStatus();

      expect(status.configured).toBe(false);
      expect(status.publicKeyPresent).toBe(false);
      expect(status.privateKeyPresent).toBe(false);
      expect(status.keyFormat).toBe('missing');
    });

    it('should return key format invalid when keys present but malformed', async () => {
      await createService({
        VAPID_PUBLIC_KEY: 'bad-key',
        VAPID_PRIVATE_KEY: 'bad-key',
      });
      service.onModuleInit();

      const status = service.getKeyStatus();

      expect(status.keyFormat).toBe('invalid');
      expect(status.publicKeyPresent).toBe(true);
      expect(status.privateKeyPresent).toBe(true);
    });

    it('should return key format missing when no keys set', async () => {
      await createService({
        VAPID_PUBLIC_KEY: undefined,
        VAPID_PRIVATE_KEY: undefined,
      });
      service.onModuleInit();

      const status = service.getKeyStatus();

      expect(status.keyFormat).toBe('missing');
    });

    it('should include lastRotatedAt when VAPID_LAST_ROTATED env var is set', async () => {
      const rotatedAt = '2026-02-16T00:00:00.000Z';
      await createService({ VAPID_LAST_ROTATED: rotatedAt });
      service.onModuleInit();

      const status = service.getKeyStatus();

      expect(status.lastRotatedAt).toBe(rotatedAt);
    });
  });

  describe('getSubject', () => {
    it('should return the configured subject', async () => {
      await createService();

      expect(service.getSubject()).toBe('mailto:admin@devos.app');
    });

    it('should return default subject when not configured', async () => {
      await createService({ VAPID_SUBJECT: undefined });

      expect(service.getSubject()).toBe('mailto:admin@devos.app');
    });
  });
});
