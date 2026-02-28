/**
 * White-Label Service Unit Tests
 * Story 22-1: White-Label Configuration (AC3)
 *
 * Tests the WhiteLabelService with mocked repositories, Redis, FileStorage, and AuditService.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WhiteLabelService } from './white-label.service';
import {
  WhiteLabelConfig,
  BackgroundMode,
  DomainStatus,
} from '../../database/entities/white-label-config.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { RedisService } from '../redis/redis.service';
import { FileStorageService } from '../file-storage/file-storage.service';
import { AuditService } from '../../shared/audit/audit.service';

// Mock dns module
jest.mock('dns', () => ({
  promises: {
    resolveCname: jest.fn(),
    resolveTxt: jest.fn(),
  },
}));

import * as dns from 'dns';

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockFileStorageService = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
  delete: jest.fn(),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('custom.devos.com'),
};

const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
const mockUserId = '22222222-2222-2222-2222-222222222222';

function createMockConfig(overrides: Partial<WhiteLabelConfig> = {}): WhiteLabelConfig {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    workspaceId: mockWorkspaceId,
    appName: 'DevOS',
    logoUrl: null,
    logoDarkUrl: null,
    faviconUrl: null,
    primaryColor: '#6366F1',
    secondaryColor: '#8B5CF6',
    backgroundMode: BackgroundMode.SYSTEM,
    fontFamily: 'Inter',
    customCss: null,
    customDomain: null,
    domainStatus: null,
    domainVerificationToken: null,
    domainVerifiedAt: null,
    sslProvisioned: false,
    isActive: false,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WhiteLabelConfig;
}

describe('WhiteLabelService', () => {
  let service: WhiteLabelService;
  let whiteLabelRepo: jest.Mocked<Repository<WhiteLabelConfig>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhiteLabelService,
        {
          provide: getRepositoryToken(WhiteLabelConfig),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
          },
        },
        { provide: RedisService, useValue: mockRedisService },
        { provide: FileStorageService, useValue: mockFileStorageService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WhiteLabelService>(WhiteLabelService);
    whiteLabelRepo = module.get(getRepositoryToken(WhiteLabelConfig));
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));

    jest.clearAllMocks();
  });

  // ===== getConfig =====

  describe('getConfig', () => {
    it('should return null when no config exists', async () => {
      mockRedisService.get.mockResolvedValue(null);
      whiteLabelRepo.findOne.mockResolvedValue(null);

      const result = await service.getConfig(mockWorkspaceId);
      expect(result).toBeNull();
    });

    it('should return cached config on cache hit', async () => {
      const config = createMockConfig();
      const cached = JSON.stringify(config);
      mockRedisService.get.mockResolvedValue(cached);

      const result = await service.getConfig(mockWorkspaceId);
      expect(result).toBeDefined();
      expect(result!.workspaceId).toBe(mockWorkspaceId);
      expect(result!.appName).toBe('DevOS');
      expect(whiteLabelRepo.findOne).not.toHaveBeenCalled();
    });

    it('should query DB and populate cache on cache miss', async () => {
      const config = createMockConfig();
      mockRedisService.get.mockResolvedValue(null);
      whiteLabelRepo.findOne.mockResolvedValue(config);

      const result = await service.getConfig(mockWorkspaceId);
      expect(result).toEqual(config);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `wl:config:${mockWorkspaceId}`,
        JSON.stringify(config),
        300,
      );
    });
  });

  // ===== upsertConfig =====

  describe('upsertConfig', () => {
    it('should create new config when none exists', async () => {
      whiteLabelRepo.findOne.mockResolvedValue(null);
      const newConfig = createMockConfig({ appName: 'MyApp' });
      whiteLabelRepo.create.mockReturnValue(newConfig);
      whiteLabelRepo.save.mockResolvedValue(newConfig);

      const result = await service.upsertConfig(mockWorkspaceId, { appName: 'MyApp' }, mockUserId);

      expect(whiteLabelRepo.create).toHaveBeenCalled();
      expect(whiteLabelRepo.save).toHaveBeenCalled();
      expect(result.appName).toBe('MyApp');
    });

    it('should update existing config with partial fields', async () => {
      const existing = createMockConfig();
      whiteLabelRepo.findOne.mockResolvedValue(existing);
      whiteLabelRepo.save.mockImplementation((entity) => Promise.resolve(entity as WhiteLabelConfig));

      const result = await service.upsertConfig(
        mockWorkspaceId,
        { primaryColor: '#FF0000' },
        mockUserId,
      );

      expect(result.primaryColor).toBe('#FF0000');
    });

    it('should sanitize customCss before storage', async () => {
      const existing = createMockConfig({ customCss: 'old css' });
      whiteLabelRepo.findOne.mockResolvedValue(existing);
      whiteLabelRepo.save.mockImplementation((entity) => Promise.resolve(entity as WhiteLabelConfig));

      await service.upsertConfig(
        mockWorkspaceId,
        { customCss: 'body { color: red; } <script>alert("xss")</script>' },
        mockUserId,
      );

      // The saved config should have sanitized CSS (script tags stripped)
      const savedArg = whiteLabelRepo.save.mock.calls[0][0] as any;
      expect(savedArg.customCss).toBeDefined();
      expect(savedArg.customCss).not.toContain('<script>');
      expect(savedArg.customCss).toContain('body { color: red; }');
    });

    it('should invalidate Redis cache after update', async () => {
      whiteLabelRepo.findOne.mockResolvedValue(createMockConfig());
      whiteLabelRepo.save.mockImplementation((entity) => Promise.resolve(entity as WhiteLabelConfig));

      await service.upsertConfig(mockWorkspaceId, { appName: 'Test' }, mockUserId);

      expect(mockRedisService.del).toHaveBeenCalledWith(`wl:config:${mockWorkspaceId}`);
    });

    it('should log audit event', async () => {
      whiteLabelRepo.findOne.mockResolvedValue(createMockConfig());
      whiteLabelRepo.save.mockImplementation((entity) => Promise.resolve(entity as WhiteLabelConfig));

      await service.upsertConfig(mockWorkspaceId, { appName: 'Test' }, mockUserId);

      expect(mockAuditService.log).toHaveBeenCalled();
    });
  });

  // ===== uploadLogo =====

  describe('uploadLogo', () => {
    it('should reject files exceeding 500KB', async () => {
      const file = {
        buffer: Buffer.alloc(600 * 1024),
        size: 600 * 1024,
        mimetype: 'image/png',
        originalname: 'logo.png',
      } as Express.Multer.File;

      await expect(
        service.uploadLogo(mockWorkspaceId, file, 'primary', mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unsupported file types', async () => {
      const file = {
        buffer: Buffer.alloc(100),
        size: 100,
        mimetype: 'application/pdf',
        originalname: 'logo.pdf',
      } as Express.Multer.File;

      await expect(
        service.uploadLogo(mockWorkspaceId, file, 'primary', mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should sanitize SVG content (strips script tags)', async () => {
      const svgContent = '<svg><script>alert("xss")</script><rect /></svg>';
      const file = {
        buffer: Buffer.from(svgContent),
        size: svgContent.length,
        mimetype: 'image/svg+xml',
        originalname: 'logo.svg',
      } as Express.Multer.File;

      mockFileStorageService.upload.mockResolvedValue('key');
      mockFileStorageService.getSignedUrl.mockResolvedValue('https://minio/signed-url');
      whiteLabelRepo.findOne.mockResolvedValue(createMockConfig());
      whiteLabelRepo.save.mockImplementation((e) => Promise.resolve(e as WhiteLabelConfig));

      await service.uploadLogo(mockWorkspaceId, file, 'primary', mockUserId);

      const uploadedBuffer = mockFileStorageService.upload.mock.calls[0][2] as Buffer;
      expect(uploadedBuffer.toString()).not.toContain('<script>');
    });

    it('should upload to MinIO and return signed URL', async () => {
      const file = {
        buffer: Buffer.alloc(100),
        size: 100,
        mimetype: 'image/png',
        originalname: 'logo.png',
      } as Express.Multer.File;

      mockFileStorageService.upload.mockResolvedValue('key');
      mockFileStorageService.getSignedUrl.mockResolvedValue('https://minio/signed-url');
      whiteLabelRepo.findOne.mockResolvedValue(createMockConfig());
      whiteLabelRepo.save.mockImplementation((e) => Promise.resolve(e as WhiteLabelConfig));

      const result = await service.uploadLogo(mockWorkspaceId, file, 'primary', mockUserId);

      expect(result.url).toBe('https://minio/signed-url');
      expect(mockFileStorageService.upload).toHaveBeenCalled();
    });

    it('should invalidate cache after upload', async () => {
      const file = {
        buffer: Buffer.alloc(100),
        size: 100,
        mimetype: 'image/png',
        originalname: 'logo.png',
      } as Express.Multer.File;

      mockFileStorageService.upload.mockResolvedValue('key');
      mockFileStorageService.getSignedUrl.mockResolvedValue('https://minio/signed-url');
      whiteLabelRepo.findOne.mockResolvedValue(createMockConfig());
      whiteLabelRepo.save.mockImplementation((e) => Promise.resolve(e as WhiteLabelConfig));

      await service.uploadLogo(mockWorkspaceId, file, 'primary', mockUserId);

      expect(mockRedisService.del).toHaveBeenCalledWith(`wl:config:${mockWorkspaceId}`);
    });
  });

  // ===== uploadFavicon =====

  describe('uploadFavicon', () => {
    it('should validate ICO/PNG format and 100KB limit', async () => {
      const file = {
        buffer: Buffer.alloc(200 * 1024),
        size: 200 * 1024,
        mimetype: 'image/png',
        originalname: 'favicon.png',
      } as Express.Multer.File;

      await expect(
        service.uploadFavicon(mockWorkspaceId, file, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===== setCustomDomain =====

  describe('setCustomDomain', () => {
    it('should generate verification token and return DNS instructions', async () => {
      whiteLabelRepo.findOne
        .mockResolvedValueOnce(null) // domain check
        .mockResolvedValueOnce(null); // config check
      whiteLabelRepo.create.mockReturnValue(createMockConfig());
      whiteLabelRepo.save.mockImplementation((e) => Promise.resolve(e as WhiteLabelConfig));

      const result = await service.setCustomDomain(mockWorkspaceId, 'app.example.com', mockUserId);

      expect(result.verificationToken).toHaveLength(64);
      expect(result.cnameTarget).toBe('custom.devos.com');
      expect(result.txtRecord).toContain('_devos-verification.');
    });

    it('should reject reserved DevOS domains', async () => {
      await expect(
        service.setCustomDomain(mockWorkspaceId, 'app.devos.com', mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject domain already used by another workspace', async () => {
      whiteLabelRepo.findOne.mockResolvedValueOnce(
        createMockConfig({ workspaceId: '99999999-9999-9999-9999-999999999999', customDomain: 'taken.example.com' }),
      );

      await expect(
        service.setCustomDomain(mockWorkspaceId, 'taken.example.com', mockUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should normalize domain to lowercase', async () => {
      whiteLabelRepo.findOne.mockResolvedValue(null);
      whiteLabelRepo.create.mockReturnValue(createMockConfig());
      whiteLabelRepo.save.mockImplementation((e) => {
        expect((e as any).customDomain).toBe('app.example.com');
        return Promise.resolve(e as WhiteLabelConfig);
      });

      await service.setCustomDomain(mockWorkspaceId, 'App.EXAMPLE.com', mockUserId);
    });
  });

  // ===== verifyDomain =====

  describe('verifyDomain', () => {
    it('should return verified:true when both CNAME and TXT records valid', async () => {
      const config = createMockConfig({
        customDomain: 'app.example.com',
        domainStatus: DomainStatus.PENDING,
        domainVerificationToken: 'abc123',
      });
      whiteLabelRepo.findOne.mockResolvedValue(config);
      whiteLabelRepo.save.mockImplementation((e) => Promise.resolve(e as WhiteLabelConfig));

      (dns.promises.resolveCname as jest.Mock).mockResolvedValue(['custom.devos.com']);
      (dns.promises.resolveTxt as jest.Mock).mockResolvedValue([['devos-verify=abc123']]);

      const result = await service.verifyDomain(mockWorkspaceId, mockUserId);

      expect(result.verified).toBe(true);
      expect(result.cnameValid).toBe(true);
      expect(result.txtValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return verified:false with specific errors when CNAME missing', async () => {
      const config = createMockConfig({
        customDomain: 'app.example.com',
        domainStatus: DomainStatus.PENDING,
        domainVerificationToken: 'abc123',
      });
      whiteLabelRepo.findOne.mockResolvedValue(config);
      whiteLabelRepo.save.mockImplementation((e) => Promise.resolve(e as WhiteLabelConfig));

      (dns.promises.resolveCname as jest.Mock).mockRejectedValue({ code: 'ENOTFOUND' });
      (dns.promises.resolveTxt as jest.Mock).mockResolvedValue([['devos-verify=abc123']]);

      const result = await service.verifyDomain(mockWorkspaceId, mockUserId);

      expect(result.verified).toBe(false);
      expect(result.cnameValid).toBe(false);
      expect(result.txtValid).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return verified:false with specific errors when TXT token mismatch', async () => {
      const config = createMockConfig({
        customDomain: 'app.example.com',
        domainStatus: DomainStatus.PENDING,
        domainVerificationToken: 'abc123',
      });
      whiteLabelRepo.findOne.mockResolvedValue(config);
      whiteLabelRepo.save.mockImplementation((e) => Promise.resolve(e as WhiteLabelConfig));

      (dns.promises.resolveCname as jest.Mock).mockResolvedValue(['custom.devos.com']);
      (dns.promises.resolveTxt as jest.Mock).mockResolvedValue([['devos-verify=wrong-token']]);

      const result = await service.verifyDomain(mockWorkspaceId, mockUserId);

      expect(result.verified).toBe(false);
      expect(result.cnameValid).toBe(true);
      expect(result.txtValid).toBe(false);
    });
  });

  // ===== removeDomain =====

  describe('removeDomain', () => {
    it('should clear domain fields and invalidate cache', async () => {
      const config = createMockConfig({ customDomain: 'app.example.com' });
      whiteLabelRepo.findOne.mockResolvedValue(config);
      whiteLabelRepo.save.mockImplementation((e) => Promise.resolve(e as WhiteLabelConfig));

      await service.removeDomain(mockWorkspaceId, mockUserId);

      expect(mockRedisService.del).toHaveBeenCalledWith(`wl:config:${mockWorkspaceId}`);
      expect(mockRedisService.del).toHaveBeenCalledWith('wl:domain:app.example.com');
    });
  });

  // ===== resetToDefaults =====

  describe('resetToDefaults', () => {
    it('should reset all fields to default values', async () => {
      const config = createMockConfig({
        appName: 'Custom',
        primaryColor: '#FF0000',
        isActive: true,
      });
      whiteLabelRepo.findOne.mockResolvedValue(config);
      whiteLabelRepo.save.mockImplementation((e) => Promise.resolve(e as WhiteLabelConfig));

      const result = await service.resetToDefaults(mockWorkspaceId, mockUserId);

      expect(result.appName).toBe('DevOS');
      expect(result.primaryColor).toBe('#6366F1');
      expect(result.secondaryColor).toBe('#8B5CF6');
      expect(result.isActive).toBe(false);
    });
  });

  // ===== getConfigByDomain =====

  describe('getConfigByDomain', () => {
    it('should return config for verified active domain', async () => {
      const config = createMockConfig({
        customDomain: 'app.example.com',
        domainStatus: DomainStatus.VERIFIED,
        isActive: true,
      });
      mockRedisService.get.mockResolvedValue(null);
      whiteLabelRepo.findOne.mockResolvedValue(config);

      const result = await service.getConfigByDomain('app.example.com');

      expect(result).toEqual(config);
      expect(mockRedisService.set).toHaveBeenCalled();
    });
  });

  // ===== generateCssVariables =====

  describe('generateCssVariables', () => {
    it('should produce correct CSS custom properties string', () => {
      const config = createMockConfig({
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
        fontFamily: 'Roboto',
      });

      const css = service.generateCssVariables(config);

      expect(css).toContain('--wl-primary: #FF0000;');
      expect(css).toContain('--wl-secondary: #00FF00;');
      expect(css).toContain('--wl-font-family: Roboto;');
      expect(css).toContain(':root');
    });
  });

  // ===== sanitizeCustomCss =====

  describe('sanitizeCustomCss', () => {
    it('should strip script tags from CSS', () => {
      const result = service.sanitizeCustomCss('body { } <script>alert(1)</script>');
      expect(result).not.toContain('<script>');
    });

    it('should strip javascript: protocol', () => {
      const result = service.sanitizeCustomCss('background: url(javascript:alert(1))');
      expect(result).not.toContain('javascript:');
    });

    it('should strip expression() calls', () => {
      const result = service.sanitizeCustomCss('width: expression(document.body.clientWidth)');
      expect(result).not.toContain('expression(');
    });

    it('should strip -moz-binding', () => {
      const result = service.sanitizeCustomCss('-moz-binding: url("http://evil.com/xbl")');
      expect(result).not.toContain('-moz-binding');
    });

    it('should limit to 10000 characters', () => {
      const longCss = 'a'.repeat(15000);
      const result = service.sanitizeCustomCss(longCss);
      expect(result.length).toBe(10000);
    });
  });
});
