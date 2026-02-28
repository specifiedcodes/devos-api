/**
 * White-Label Controller Unit Tests
 * Story 22-1: White-Label Configuration (AC4)
 *
 * Tests HTTP endpoints with mocked WhiteLabelService.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WhiteLabelController, WhiteLabelPublicController } from './white-label.controller';
import { WhiteLabelService } from './white-label.service';
import { WhiteLabelConfigResponseDto } from './dto/white-label-config-response.dto';
import {
  WhiteLabelConfig,
  BackgroundMode,
  DomainStatus,
  BackgroundType,
} from '../../database/entities/white-label-config.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../common/guards/role.guard';

const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
const mockUserId = '22222222-2222-2222-2222-222222222222';

function createMockConfig(overrides: Partial<WhiteLabelConfig> = {}): WhiteLabelConfig {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    workspaceId: mockWorkspaceId,
    appName: 'TestApp',
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
    showDevosBranding: false,
    backgroundType: BackgroundType.COLOR,
    backgroundValue: '#f3f4f6',
    heroText: null,
    heroSubtext: null,
    customLinks: [],
    showSignup: false,
    loginPageCss: null,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WhiteLabelConfig;
}

const mockReq = { user: { id: mockUserId } };

describe('WhiteLabelController', () => {
  let controller: WhiteLabelController;
  let service: jest.Mocked<WhiteLabelService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhiteLabelController],
      providers: [
        {
          provide: WhiteLabelService,
          useValue: {
            getConfig: jest.fn(),
            upsertConfig: jest.fn(),
            uploadLogo: jest.fn(),
            uploadFavicon: jest.fn(),
            setCustomDomain: jest.fn(),
            verifyDomain: jest.fn(),
            removeDomain: jest.fn(),
            resetToDefaults: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<WhiteLabelController>(WhiteLabelController);
    service = module.get(WhiteLabelService);
  });

  describe('GET /white-label', () => {
    it('should return null when no config exists', async () => {
      service.getConfig.mockResolvedValue(null);
      const result = await controller.getConfig(mockWorkspaceId);
      expect(result).toBeNull();
    });

    it('should return config for workspace member', async () => {
      const config = createMockConfig();
      service.getConfig.mockResolvedValue(config);

      const result = await controller.getConfig(mockWorkspaceId);
      expect(result).toBeInstanceOf(WhiteLabelConfigResponseDto);
      expect(result!.appName).toBe('TestApp');
    });
  });

  describe('PUT /white-label', () => {
    it('should create config with valid dto', async () => {
      const config = createMockConfig({ appName: 'NewApp' });
      service.upsertConfig.mockResolvedValue(config);

      const result = await controller.upsertConfig(
        mockWorkspaceId,
        { appName: 'NewApp' },
        mockReq,
      );

      expect(result).toBeInstanceOf(WhiteLabelConfigResponseDto);
      expect(result.appName).toBe('NewApp');
      expect(service.upsertConfig).toHaveBeenCalledWith(
        mockWorkspaceId,
        { appName: 'NewApp' },
        mockUserId,
      );
    });
  });

  describe('POST /logo', () => {
    it('should upload file and return URL', async () => {
      service.uploadLogo.mockResolvedValue({ url: 'https://minio/logo.png' });

      const file = {
        buffer: Buffer.alloc(100),
        size: 100,
        mimetype: 'image/png',
        originalname: 'logo.png',
      } as Express.Multer.File;

      const result = await controller.uploadLogo(mockWorkspaceId, file, 'primary', mockReq);
      expect(result.url).toBe('https://minio/logo.png');
    });

    it('should reject missing file', async () => {
      await expect(
        controller.uploadLogo(mockWorkspaceId, undefined as any, 'primary', mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate variant query param', async () => {
      const file = {
        buffer: Buffer.alloc(100),
        size: 100,
        mimetype: 'image/png',
        originalname: 'logo.png',
      } as Express.Multer.File;

      await expect(
        controller.uploadLogo(mockWorkspaceId, file, 'invalid' as any, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /favicon', () => {
    it('should upload ICO/PNG file', async () => {
      service.uploadFavicon.mockResolvedValue({ url: 'https://minio/favicon.ico' });

      const file = {
        buffer: Buffer.alloc(50),
        size: 50,
        mimetype: 'image/x-icon',
        originalname: 'favicon.ico',
      } as Express.Multer.File;

      const result = await controller.uploadFavicon(mockWorkspaceId, file, mockReq);
      expect(result.url).toBe('https://minio/favicon.ico');
    });

    it('should reject missing file', async () => {
      await expect(
        controller.uploadFavicon(mockWorkspaceId, undefined as any, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /domain', () => {
    it('should set domain and return verification instructions', async () => {
      service.setCustomDomain.mockResolvedValue({
        verificationToken: 'token123',
        cnameTarget: 'custom.devos.com',
        txtRecord: '_devos-verification.app.example.com',
      });

      const result = await controller.setDomain(
        mockWorkspaceId,
        { domain: 'app.example.com' },
        mockReq,
      );

      expect(result.verificationToken).toBe('token123');
      expect(result.cnameTarget).toBe('custom.devos.com');
    });
  });

  describe('POST /domain/verify', () => {
    it('should return verification result', async () => {
      service.verifyDomain.mockResolvedValue({
        verified: true,
        cnameValid: true,
        txtValid: true,
        errors: [],
      });

      const result = await controller.verifyDomain(mockWorkspaceId, mockReq);
      expect(result.verified).toBe(true);
    });
  });

  describe('DELETE /domain', () => {
    it('should remove domain (204 response)', async () => {
      service.removeDomain.mockResolvedValue(undefined);
      await controller.removeDomain(mockWorkspaceId, mockReq);
      expect(service.removeDomain).toHaveBeenCalledWith(mockWorkspaceId, mockUserId);
    });
  });

  describe('POST /reset', () => {
    it('should reset config to defaults', async () => {
      const config = createMockConfig({ appName: 'DevOS', isActive: false });
      service.resetToDefaults.mockResolvedValue(config);

      const result = await controller.resetToDefaults(mockWorkspaceId, mockReq);
      expect(result.appName).toBe('DevOS');
    });
  });
});

describe('WhiteLabelPublicController', () => {
  let controller: WhiteLabelPublicController;
  let service: jest.Mocked<WhiteLabelService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhiteLabelPublicController],
      providers: [
        {
          provide: WhiteLabelService,
          useValue: {
            getConfigByDomain: jest.fn(),
            getLoginPageConfig: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<WhiteLabelPublicController>(WhiteLabelPublicController);
    service = module.get(WhiteLabelService);
  });

  describe('GET /resolve/:domain', () => {
    it('should return config for verified domain (public, no auth)', async () => {
      const config = createMockConfig({
        customDomain: 'app.example.com',
        domainStatus: DomainStatus.VERIFIED,
        isActive: true,
      });
      service.getConfigByDomain.mockResolvedValue(config);

      const result = await controller.resolveDomain('app.example.com');
      expect(result).toBeInstanceOf(WhiteLabelConfigResponseDto);
      expect(result!.customDomain).toBe('app.example.com');
    });

    it('should return null when domain not found', async () => {
      service.getConfigByDomain.mockResolvedValue(null);

      const result = await controller.resolveDomain('unknown.example.com');
      expect(result).toBeNull();
    });
  });

  describe('GET /login-config/:identifier', () => {
    it('should return null for non-existent identifier', async () => {
      service.getLoginPageConfig.mockResolvedValue({ config: null, ssoProviders: [] });

      const result = await controller.getLoginPageConfig('nonexistent');

      expect(result).toBeNull();
    });

    it('should return config for valid workspace UUID', async () => {
      const config = createMockConfig();
      service.getLoginPageConfig.mockResolvedValue({ config, ssoProviders: [] });

      const result = await controller.getLoginPageConfig(mockWorkspaceId);

      expect(result).toBeDefined();
      expect(result?.appName).toBe('TestApp');
      expect(service.getLoginPageConfig).toHaveBeenCalledWith(mockWorkspaceId);
    });

    it('should return config for custom domain', async () => {
      const config = createMockConfig({
        customDomain: 'custom.example.com',
        domainStatus: DomainStatus.VERIFIED,
      });
      service.getLoginPageConfig.mockResolvedValue({ config, ssoProviders: [] });

      const result = await controller.getLoginPageConfig('custom.example.com');

      expect(result).toBeDefined();
      expect(result?.appName).toBe('TestApp');
      expect(service.getLoginPageConfig).toHaveBeenCalledWith('custom.example.com');
    });

    it('should include ssoProviders array', async () => {
      const config = createMockConfig();
      service.getLoginPageConfig.mockResolvedValue({
        config,
        ssoProviders: ['saml', 'oidc'],
      });

      const result = await controller.getLoginPageConfig(mockWorkspaceId);

      expect(result).toBeDefined();
      expect(result?.ssoProviders).toEqual(['saml', 'oidc']);
    });

    it('should include SAML in ssoProviders when SAML is configured', async () => {
      const config = createMockConfig();
      service.getLoginPageConfig.mockResolvedValue({
        config,
        ssoProviders: ['saml'],
      });

      const result = await controller.getLoginPageConfig(mockWorkspaceId);

      expect(result?.ssoProviders).toContain('saml');
    });

    it('should include OIDC in ssoProviders when OIDC is configured', async () => {
      const config = createMockConfig();
      service.getLoginPageConfig.mockResolvedValue({
        config,
        ssoProviders: ['oidc'],
      });

      const result = await controller.getLoginPageConfig(mockWorkspaceId);

      expect(result?.ssoProviders).toContain('oidc');
    });

    it('should return empty array when no SSO configured', async () => {
      const config = createMockConfig();
      service.getLoginPageConfig.mockResolvedValue({ config, ssoProviders: [] });

      const result = await controller.getLoginPageConfig(mockWorkspaceId);

      expect(result?.ssoProviders).toEqual([]);
    });

    it('should map all config fields to response DTO', async () => {
      const config = createMockConfig({
        appName: 'CustomApp',
        logoUrl: 'https://example.com/logo.png',
        logoDarkUrl: 'https://example.com/logo-dark.png',
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
        fontFamily: 'Roboto',
        showDevosBranding: true,
        backgroundType: BackgroundType.GRADIENT,
        backgroundValue: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        heroText: 'Welcome',
        heroSubtext: 'Sign in to continue',
        customLinks: [{ text: 'Privacy', url: 'https://example.com/privacy' }],
        showSignup: true,
        loginPageCss: 'body { background: red; }',
      });
      service.getLoginPageConfig.mockResolvedValue({
        config,
        ssoProviders: ['saml'],
      });

      const result = await controller.getLoginPageConfig(mockWorkspaceId);

      expect(result).toMatchObject({
        appName: 'CustomApp',
        logoUrl: 'https://example.com/logo.png',
        logoDarkUrl: 'https://example.com/logo-dark.png',
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
        fontFamily: 'Roboto',
        showDevosBranding: true,
        backgroundType: BackgroundType.GRADIENT,
        backgroundValue: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        heroText: 'Welcome',
        heroSubtext: 'Sign in to continue',
        customLinks: [{ text: 'Privacy', url: 'https://example.com/privacy' }],
        showSignup: true,
        loginPageCss: 'body { background: red; }',
        ssoProviders: ['saml'],
      });
    });
  });
});
