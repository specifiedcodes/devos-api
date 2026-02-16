import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ScimTokenService } from '../scim-token.service';
import { ScimToken } from '../../../../database/entities/scim-token.entity';
import { ScimConfiguration } from '../../../../database/entities/scim-configuration.entity';
import { SsoAuditService } from '../../sso-audit.service';
import { SsoAuditEventType } from '../../../../database/entities/sso-audit-event.entity';
import { RedisService } from '../../../redis/redis.service';
import { SCIM_CONSTANTS } from '../../constants/scim.constants';

describe('ScimTokenService', () => {
  let service: ScimTokenService;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const actorId = '550e8400-e29b-41d4-a716-446655440001';
  const tokenId = '550e8400-e29b-41d4-a716-446655440002';
  const configId = '550e8400-e29b-41d4-a716-446655440003';

  const mockTokenRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };

  const mockConfigRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockSsoAuditService = {
    logEvent: jest.fn().mockResolvedValue({}),
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScimTokenService,
        { provide: getRepositoryToken(ScimToken), useValue: mockTokenRepository },
        { provide: getRepositoryToken(ScimConfiguration), useValue: mockConfigRepository },
        { provide: SsoAuditService, useValue: mockSsoAuditService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<ScimTokenService>(ScimTokenService);
  });

  describe('generateToken', () => {
    it('should generate token with correct prefix format (devos_sc_...)', async () => {
      const saved = { id: tokenId, workspaceId, tokenPrefix: 'devos_sc_abc', tokenHash: 'hash', label: 'Test', isActive: true, createdAt: new Date(), updatedAt: new Date() };
      mockTokenRepository.create.mockReturnValue(saved);
      mockTokenRepository.save.mockResolvedValue(saved);

      const result = await service.generateToken(workspaceId, 'Test', null, actorId);

      expect(result.token).toMatch(/^devos_sc_[a-f0-9]+$/);
    });

    it('should store SHA-256 hash (not plaintext)', async () => {
      const saved = { id: tokenId, workspaceId, tokenPrefix: 'devos_sc_abc', tokenHash: 'hash', label: 'Test', isActive: true, createdAt: new Date(), updatedAt: new Date() };
      mockTokenRepository.create.mockReturnValue(saved);
      mockTokenRepository.save.mockResolvedValue(saved);

      const result = await service.generateToken(workspaceId, 'Test', null, actorId);

      expect(mockTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: expect.any(String),
        }),
      );
      // Token hash should not equal the plaintext token
      const createCall = mockTokenRepository.create.mock.calls[0][0];
      expect(createCall.tokenHash).not.toBe(result.token);
    });

    it('should return full plaintext token only once', async () => {
      const saved = { id: tokenId, workspaceId, tokenPrefix: 'devos_sc_abc', tokenHash: 'hash', label: 'Test', isActive: true, createdAt: new Date(), updatedAt: new Date() };
      mockTokenRepository.create.mockReturnValue(saved);
      mockTokenRepository.save.mockResolvedValue(saved);

      const result = await service.generateToken(workspaceId, 'Test', null, actorId);

      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(20);
    });

    it('should set correct label, workspace_id, created_by', async () => {
      const saved = { id: tokenId, workspaceId, tokenPrefix: 'devos_sc_abc', tokenHash: 'hash', label: 'My Token', isActive: true, createdBy: actorId, createdAt: new Date(), updatedAt: new Date() };
      mockTokenRepository.create.mockReturnValue(saved);
      mockTokenRepository.save.mockResolvedValue(saved);

      await service.generateToken(workspaceId, 'My Token', null, actorId);

      expect(mockTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          label: 'My Token',
          createdBy: actorId,
        }),
      );
    });

    it('should log SCIM_TOKEN_CREATED audit event', async () => {
      const saved = { id: tokenId, workspaceId, tokenPrefix: 'devos_sc_abc', tokenHash: 'hash', label: 'Test', isActive: true, createdAt: new Date(), updatedAt: new Date() };
      mockTokenRepository.create.mockReturnValue(saved);
      mockTokenRepository.save.mockResolvedValue(saved);

      await service.generateToken(workspaceId, 'Test', null, actorId);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SCIM_TOKEN_CREATED,
          workspaceId,
          actorId,
        }),
      );
    });

    it('should set expires_at if provided', async () => {
      const expiresAt = new Date('2025-12-31');
      const saved = { id: tokenId, workspaceId, tokenPrefix: 'devos_sc_abc', tokenHash: 'hash', label: 'Test', isActive: true, expiresAt, createdAt: new Date(), updatedAt: new Date() };
      mockTokenRepository.create.mockReturnValue(saved);
      mockTokenRepository.save.mockResolvedValue(saved);

      await service.generateToken(workspaceId, 'Test', expiresAt, actorId);

      expect(mockTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt }),
      );
    });
  });

  describe('listTokens', () => {
    it('should return all tokens for workspace', async () => {
      const tokens = [
        { id: 'tok-1', workspaceId, tokenPrefix: 'devos_sc_ab', label: 'Token 1', isActive: true, createdAt: new Date() },
        { id: 'tok-2', workspaceId, tokenPrefix: 'devos_sc_cd', label: 'Token 2', isActive: false, createdAt: new Date() },
      ];
      mockTokenRepository.find.mockResolvedValue(tokens);

      const result = await service.listTokens(workspaceId);

      expect(result).toHaveLength(2);
    });

    it('should not include token hash in response', async () => {
      mockTokenRepository.find.mockResolvedValue([]);

      await service.listTokens(workspaceId);

      const findCall = mockTokenRepository.find.mock.calls[0][0];
      expect(findCall.select).not.toContain('tokenHash');
    });
  });

  describe('revokeToken', () => {
    it('should set is_active to false', async () => {
      const token = { id: tokenId, workspaceId, isActive: true, tokenPrefix: 'devos_sc_ab' };
      mockTokenRepository.findOne.mockResolvedValue(token);
      mockTokenRepository.save.mockResolvedValue({ ...token, isActive: false });

      const result = await service.revokeToken(workspaceId, tokenId, actorId);

      expect(result.isActive).toBe(false);
    });

    it('should log SCIM_TOKEN_REVOKED audit event', async () => {
      const token = { id: tokenId, workspaceId, isActive: true, tokenPrefix: 'devos_sc_ab' };
      mockTokenRepository.findOne.mockResolvedValue(token);
      mockTokenRepository.save.mockResolvedValue({ ...token, isActive: false });

      await service.revokeToken(workspaceId, tokenId, actorId);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SCIM_TOKEN_REVOKED,
        }),
      );
    });

    it('should throw NotFoundException for non-existent token', async () => {
      mockTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.revokeToken(workspaceId, tokenId, actorId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for token in different workspace', async () => {
      mockTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.revokeToken('different-workspace', tokenId, actorId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('rotateToken', () => {
    it('should revoke old token and generate new token', async () => {
      const oldToken = { id: tokenId, workspaceId, isActive: true, label: 'Token', expiresAt: null, tokenPrefix: 'devos_sc_ab' };
      mockTokenRepository.findOne.mockResolvedValue(oldToken);
      mockTokenRepository.save.mockResolvedValue({ ...oldToken, isActive: false });
      const newSaved = { id: 'new-token-id', workspaceId, tokenPrefix: 'devos_sc_cd', tokenHash: 'newhash', label: 'Token', isActive: true, createdAt: new Date(), updatedAt: new Date() };
      mockTokenRepository.create.mockReturnValue(newSaved);
      // The second save returns the new token
      mockTokenRepository.save
        .mockResolvedValueOnce({ ...oldToken, isActive: false })
        .mockResolvedValueOnce(newSaved);

      const result = await service.rotateToken(workspaceId, tokenId, actorId);

      expect(result.token).toBeDefined();
      expect(result.tokenRecord.id).toBe('new-token-id');
    });

    it('should log SCIM_TOKEN_ROTATED audit event', async () => {
      const oldToken = { id: tokenId, workspaceId, isActive: true, label: 'Token', expiresAt: null, tokenPrefix: 'devos_sc_ab' };
      mockTokenRepository.findOne.mockResolvedValue(oldToken);
      mockTokenRepository.save.mockResolvedValue({ ...oldToken, isActive: false });
      const newSaved = { id: 'new-token-id', workspaceId, tokenPrefix: 'devos_sc_cd', tokenHash: 'newhash', label: 'Token', isActive: true, createdAt: new Date(), updatedAt: new Date() };
      mockTokenRepository.create.mockReturnValue(newSaved);
      mockTokenRepository.save
        .mockResolvedValueOnce({ ...oldToken, isActive: false })
        .mockResolvedValueOnce(newSaved);

      await service.rotateToken(workspaceId, tokenId, actorId);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SCIM_TOKEN_ROTATED,
        }),
      );
    });
  });

  describe('validateToken', () => {
    it('should return token record for valid active token', async () => {
      const token = { id: tokenId, workspaceId, isActive: true, expiresAt: null };
      mockTokenRepository.findOne.mockResolvedValue(token);

      const result = await service.validateToken('some-token');

      expect(result).toEqual(token);
    });

    it('should return null for invalid token', async () => {
      mockTokenRepository.findOne.mockResolvedValue(null);

      const result = await service.validateToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      const expired = { id: tokenId, workspaceId, isActive: true, expiresAt: new Date('2020-01-01') };
      mockTokenRepository.findOne.mockResolvedValue(expired);

      const result = await service.validateToken('some-token');

      expect(result).toBeNull();
    });
  });

  describe('getConfig', () => {
    it('should create default config on first access', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);
      const defaultConfig = { id: configId, workspaceId, enabled: false, defaultRole: 'developer', createdAt: new Date(), updatedAt: new Date() };
      mockConfigRepository.create.mockReturnValue(defaultConfig);
      mockConfigRepository.save.mockResolvedValue(defaultConfig);

      const result = await service.getConfig(workspaceId);

      expect(result).toEqual(defaultConfig);
      expect(mockConfigRepository.create).toHaveBeenCalled();
    });

    it('should return cached config', async () => {
      const cachedConfig = { id: configId, workspaceId, enabled: true, defaultRole: 'admin' };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedConfig));

      const result = await service.getConfig(workspaceId);

      expect(result.id).toBe(configId);
      expect(mockConfigRepository.findOne).not.toHaveBeenCalled();
    });

    it('should cache config in Redis after DB fetch', async () => {
      mockRedisService.get.mockResolvedValue(null);
      const config = { id: configId, workspaceId, enabled: true };
      mockConfigRepository.findOne.mockResolvedValue(config);

      await service.getConfig(workspaceId);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `${SCIM_CONSTANTS.CACHE_KEY_PREFIX}${workspaceId}`,
        expect.any(String),
        SCIM_CONSTANTS.CACHE_TTL_SECONDS,
      );
    });
  });

  describe('updateConfig', () => {
    it('should update config and invalidate cache', async () => {
      const config = { id: configId, workspaceId, enabled: false, defaultRole: 'developer', baseUrl: '', syncGroups: true, autoDeactivate: true, autoReactivate: true };
      mockConfigRepository.findOne.mockResolvedValue({ ...config });
      mockConfigRepository.save.mockResolvedValue({ ...config, enabled: true });

      const result = await service.updateConfig(workspaceId, { enabled: true }, actorId);

      expect(result.enabled).toBe(true);
      expect(mockRedisService.del).toHaveBeenCalledWith(
        `${SCIM_CONSTANTS.CACHE_KEY_PREFIX}${workspaceId}`,
      );
    });

    it('should log SCIM_CONFIG_UPDATED audit event', async () => {
      const config = { id: configId, workspaceId, enabled: false, defaultRole: 'developer', baseUrl: '', syncGroups: true, autoDeactivate: true, autoReactivate: true };
      mockConfigRepository.findOne.mockResolvedValue({ ...config });
      mockConfigRepository.save.mockResolvedValue({ ...config, enabled: true });

      await service.updateConfig(workspaceId, { enabled: true }, actorId);

      await new Promise((r) => setTimeout(r, 10));
      expect(mockSsoAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: SsoAuditEventType.SCIM_CONFIG_UPDATED,
          workspaceId,
          actorId,
        }),
      );
    });
  });
});
