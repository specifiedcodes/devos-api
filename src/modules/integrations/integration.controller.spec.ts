import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationController,
  IntegrationCallbackController,
} from './integration.controller';
import { IntegrationConnectionService } from './integration-connection.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';

describe('IntegrationController', () => {
  let controller: IntegrationController;
  let mockService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockUserId = '22222222-2222-2222-2222-222222222222';
  const mockReq = { user: { userId: mockUserId } };

  beforeEach(async () => {
    mockService = {
      generateAuthorizationUrl: jest.fn(),
      handleCallback: jest.fn(),
      getIntegrations: jest.fn(),
      getGitHubStatus: jest.fn(),
      disconnectIntegration: jest.fn(),
      generateRailwayAuthorizationUrl: jest.fn(),
      handleRailwayCallback: jest.fn(),
      getRailwayStatus: jest.fn(),
      generateVercelAuthorizationUrl: jest.fn(),
      handleVercelCallback: jest.fn(),
      getVercelStatus: jest.fn(),
      generateSupabaseAuthorizationUrl: jest.fn(),
      handleSupabaseCallback: jest.fn(),
      getSupabaseStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationController],
      providers: [
        {
          provide: IntegrationConnectionService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<IntegrationController>(IntegrationController);
    jest.clearAllMocks();
  });

  describe('GET /integrations/github/oauth/authorize', () => {
    it('should return authorization URL', async () => {
      const expectedUrl = {
        authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=test',
      };
      mockService.generateAuthorizationUrl.mockResolvedValue(expectedUrl);

      const result = await controller.getAuthorizationUrl(
        mockWorkspaceId,
        mockReq,
      );

      expect(result).toEqual(expectedUrl);
      expect(mockService.generateAuthorizationUrl).toHaveBeenCalledWith(
        mockUserId,
        mockWorkspaceId,
      );
    });
  });

  describe('GET /integrations', () => {
    it('should return list of integrations', async () => {
      const expectedIntegrations = [
        {
          id: 'int-1',
          provider: 'github',
          status: 'active',
          externalUsername: 'testuser',
          connectedAt: '2026-01-29T10:00:00.000Z',
        },
      ];
      mockService.getIntegrations.mockResolvedValue(expectedIntegrations);

      const result = await controller.getIntegrations(mockWorkspaceId);

      expect(result).toEqual(expectedIntegrations);
      expect(mockService.getIntegrations).toHaveBeenCalledWith(mockWorkspaceId);
    });
  });

  describe('GET /integrations/github/status', () => {
    it('should return GitHub connection status', async () => {
      const expectedStatus = {
        connected: true,
        username: 'testuser',
        avatarUrl: 'https://github.com/testuser.png',
        scopes: ['repo', 'user:email'],
        connectedAt: '2026-01-29T10:00:00.000Z',
      };
      mockService.getGitHubStatus.mockResolvedValue(expectedStatus);

      const result = await controller.getGitHubStatus(mockWorkspaceId);

      expect(result).toEqual(expectedStatus);
      expect(mockService.getGitHubStatus).toHaveBeenCalledWith(mockWorkspaceId);
    });
  });

  describe('DELETE /integrations/github', () => {
    it('should disconnect GitHub integration', async () => {
      const expectedResult = {
        success: true,
        message: 'GitHub integration disconnected',
      };
      mockService.disconnectIntegration.mockResolvedValue(expectedResult);

      const result = await controller.disconnectGitHub(
        mockWorkspaceId,
        mockReq,
      );

      expect(result).toEqual(expectedResult);
      expect(mockService.disconnectIntegration).toHaveBeenCalledWith(
        mockWorkspaceId,
        'github',
        mockUserId,
      );
    });
  });

  describe('GET /integrations/railway/oauth/authorize', () => {
    it('should return Railway authorization URL', async () => {
      const expectedUrl = {
        authorizationUrl: 'https://railway.app/authorize?client_id=test',
      };
      mockService.generateRailwayAuthorizationUrl.mockResolvedValue(
        expectedUrl,
      );

      const result = await controller.getRailwayAuthorizationUrl(
        mockWorkspaceId,
        mockReq,
      );

      expect(result).toEqual(expectedUrl);
      expect(
        mockService.generateRailwayAuthorizationUrl,
      ).toHaveBeenCalledWith(mockUserId, mockWorkspaceId);
    });
  });

  describe('GET /integrations/railway/status', () => {
    it('should return Railway connection status', async () => {
      const expectedStatus = {
        connected: true,
        username: 'railwayuser',
        connectedAt: '2026-02-01T10:00:00.000Z',
      };
      mockService.getRailwayStatus.mockResolvedValue(expectedStatus);

      const result = await controller.getRailwayStatus(mockWorkspaceId);

      expect(result).toEqual(expectedStatus);
      expect(mockService.getRailwayStatus).toHaveBeenCalledWith(
        mockWorkspaceId,
      );
    });

    it('should return not connected when no Railway integration exists', async () => {
      mockService.getRailwayStatus.mockResolvedValue({
        connected: false,
      });

      const result = await controller.getRailwayStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
    });
  });

  describe('DELETE /integrations/railway', () => {
    it('should disconnect Railway integration', async () => {
      const expectedResult = {
        success: true,
        message: 'Railway integration disconnected',
      };
      mockService.disconnectIntegration.mockResolvedValue(expectedResult);

      const result = await controller.disconnectRailway(
        mockWorkspaceId,
        mockReq,
      );

      expect(result).toEqual(expectedResult);
      expect(mockService.disconnectIntegration).toHaveBeenCalledWith(
        mockWorkspaceId,
        'railway',
        mockUserId,
      );
    });
  });

  describe('GET /integrations/vercel/oauth/authorize', () => {
    it('should return Vercel authorization URL', async () => {
      const expectedUrl = {
        authorizationUrl: 'https://vercel.com/integrations/oauthdone?client_id=test',
      };
      mockService.generateVercelAuthorizationUrl.mockResolvedValue(
        expectedUrl,
      );

      const result = await controller.getVercelAuthorizationUrl(
        mockWorkspaceId,
        mockReq,
      );

      expect(result).toEqual(expectedUrl);
      expect(
        mockService.generateVercelAuthorizationUrl,
      ).toHaveBeenCalledWith(mockUserId, mockWorkspaceId);
    });
  });

  describe('GET /integrations/vercel/status', () => {
    it('should return Vercel connection status', async () => {
      const expectedStatus = {
        connected: true,
        username: 'verceluser',
        connectedAt: '2026-02-01T10:00:00.000Z',
      };
      mockService.getVercelStatus.mockResolvedValue(expectedStatus);

      const result = await controller.getVercelStatus(mockWorkspaceId);

      expect(result).toEqual(expectedStatus);
      expect(mockService.getVercelStatus).toHaveBeenCalledWith(
        mockWorkspaceId,
      );
    });

    it('should return not connected when no Vercel integration exists', async () => {
      mockService.getVercelStatus.mockResolvedValue({
        connected: false,
      });

      const result = await controller.getVercelStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
    });
  });

  describe('DELETE /integrations/vercel', () => {
    it('should disconnect Vercel integration', async () => {
      const expectedResult = {
        success: true,
        message: 'Vercel integration disconnected',
      };
      mockService.disconnectIntegration.mockResolvedValue(expectedResult);

      const result = await controller.disconnectVercel(
        mockWorkspaceId,
        mockReq,
      );

      expect(result).toEqual(expectedResult);
      expect(mockService.disconnectIntegration).toHaveBeenCalledWith(
        mockWorkspaceId,
        'vercel',
        mockUserId,
      );
    });
  });

  describe('GET /integrations/supabase/oauth/authorize', () => {
    it('should return Supabase authorization URL', async () => {
      const expectedUrl = {
        authorizationUrl: 'https://api.supabase.com/v1/oauth/authorize?client_id=test',
      };
      mockService.generateSupabaseAuthorizationUrl.mockResolvedValue(
        expectedUrl,
      );

      const result = await controller.getSupabaseAuthorizationUrl(
        mockWorkspaceId,
        mockReq,
      );

      expect(result).toEqual(expectedUrl);
      expect(
        mockService.generateSupabaseAuthorizationUrl,
      ).toHaveBeenCalledWith(mockUserId, mockWorkspaceId);
    });
  });

  describe('GET /integrations/supabase/status', () => {
    it('should return Supabase connection status', async () => {
      const expectedStatus = {
        connected: true,
        username: 'supabaseorg',
        connectedAt: '2026-02-01T10:00:00.000Z',
      };
      mockService.getSupabaseStatus.mockResolvedValue(expectedStatus);

      const result = await controller.getSupabaseStatus(mockWorkspaceId);

      expect(result).toEqual(expectedStatus);
      expect(mockService.getSupabaseStatus).toHaveBeenCalledWith(
        mockWorkspaceId,
      );
    });

    it('should return not connected when no Supabase integration exists', async () => {
      mockService.getSupabaseStatus.mockResolvedValue({
        connected: false,
      });

      const result = await controller.getSupabaseStatus(mockWorkspaceId);

      expect(result.connected).toBe(false);
    });
  });

  describe('DELETE /integrations/supabase', () => {
    it('should disconnect Supabase integration', async () => {
      const expectedResult = {
        success: true,
        message: 'Supabase integration disconnected',
      };
      mockService.disconnectIntegration.mockResolvedValue(expectedResult);

      const result = await controller.disconnectSupabase(
        mockWorkspaceId,
        mockReq,
      );

      expect(result).toEqual(expectedResult);
      expect(mockService.disconnectIntegration).toHaveBeenCalledWith(
        mockWorkspaceId,
        'supabase',
        mockUserId,
      );
    });
  });
});

describe('IntegrationCallbackController', () => {
  let controller: IntegrationCallbackController;
  let mockService: any;

  beforeEach(async () => {
    mockService = {
      generateAuthorizationUrl: jest.fn(),
      handleCallback: jest.fn(),
      handleRailwayCallback: jest.fn(),
      handleVercelCallback: jest.fn(),
      handleSupabaseCallback: jest.fn(),
      getIntegrations: jest.fn(),
      getGitHubStatus: jest.fn(),
      getRailwayStatus: jest.fn(),
      getVercelStatus: jest.fn(),
      getSupabaseStatus: jest.fn(),
      disconnectIntegration: jest.fn(),
      generateRailwayAuthorizationUrl: jest.fn(),
      generateVercelAuthorizationUrl: jest.fn(),
      generateSupabaseAuthorizationUrl: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, string> = {
          FRONTEND_URL: 'http://localhost:3000',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationCallbackController],
      providers: [
        {
          provide: IntegrationConnectionService,
          useValue: mockService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<IntegrationCallbackController>(
      IntegrationCallbackController,
    );
    jest.clearAllMocks();
  });

  describe('GET /integrations/github/oauth/callback', () => {
    const mockRes = {
      redirect: jest.fn(),
    } as any;

    it('should redirect to frontend on success', async () => {
      const redirectUrl =
        'http://localhost:3000/settings/integrations?github=connected';
      mockService.handleCallback.mockResolvedValue({ redirectUrl });

      await controller.handleGitHubCallback(
        { code: 'auth-code', state: 'csrf-state' },
        mockRes,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(redirectUrl);
      expect(mockService.handleCallback).toHaveBeenCalledWith(
        'auth-code',
        'csrf-state',
      );
    });

    it('should redirect to frontend with error on failure', async () => {
      mockService.handleCallback.mockRejectedValue(
        new Error('Invalid state'),
      );

      await controller.handleGitHubCallback(
        { code: 'auth-code', state: 'bad-state' },
        mockRes,
      );

      expect(mockRes.redirect).toHaveBeenCalled();
      const redirectUrl = mockRes.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('github=error');
      expect(redirectUrl).toContain('message=');
    });
  });

  describe('GET /integrations/railway/oauth/callback', () => {
    const mockRes = {
      redirect: jest.fn(),
    } as any;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should redirect to frontend on success', async () => {
      const redirectUrl =
        'http://localhost:3000/settings/integrations?railway=connected';
      mockService.handleRailwayCallback.mockResolvedValue({ redirectUrl });

      await controller.handleRailwayCallback(
        { code: 'railway-auth-code', state: 'csrf-state' },
        mockRes,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(redirectUrl);
      expect(mockService.handleRailwayCallback).toHaveBeenCalledWith(
        'railway-auth-code',
        'csrf-state',
      );
    });

    it('should redirect to frontend with error on failure', async () => {
      mockService.handleRailwayCallback.mockRejectedValue(
        new Error('Invalid state'),
      );

      await controller.handleRailwayCallback(
        { code: 'auth-code', state: 'bad-state' },
        mockRes,
      );

      expect(mockRes.redirect).toHaveBeenCalled();
      const redirectUrl = mockRes.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('railway=error');
      expect(redirectUrl).toContain('message=');
    });
  });

  describe('GET /integrations/vercel/oauth/callback', () => {
    const mockRes = {
      redirect: jest.fn(),
    } as any;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should redirect to frontend on success', async () => {
      const redirectUrl =
        'http://localhost:3000/settings/integrations?vercel=connected';
      mockService.handleVercelCallback.mockResolvedValue({ redirectUrl });

      await controller.handleVercelCallback(
        { code: 'vercel-auth-code', state: 'csrf-state' },
        mockRes,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(redirectUrl);
      expect(mockService.handleVercelCallback).toHaveBeenCalledWith(
        'vercel-auth-code',
        'csrf-state',
      );
    });

    it('should redirect to frontend with error on failure', async () => {
      mockService.handleVercelCallback.mockRejectedValue(
        new Error('Invalid state'),
      );

      await controller.handleVercelCallback(
        { code: 'auth-code', state: 'bad-state' },
        mockRes,
      );

      expect(mockRes.redirect).toHaveBeenCalled();
      const redirectUrl = mockRes.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('vercel=error');
      expect(redirectUrl).toContain('message=');
    });
  });

  describe('GET /integrations/supabase/oauth/callback', () => {
    const mockRes = {
      redirect: jest.fn(),
    } as any;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should redirect to frontend on success', async () => {
      const redirectUrl =
        'http://localhost:3000/settings/integrations?supabase=connected';
      mockService.handleSupabaseCallback.mockResolvedValue({ redirectUrl });

      await controller.handleSupabaseCallback(
        { code: 'supabase-auth-code', state: 'csrf-state' },
        mockRes,
      );

      expect(mockRes.redirect).toHaveBeenCalledWith(redirectUrl);
      expect(mockService.handleSupabaseCallback).toHaveBeenCalledWith(
        'supabase-auth-code',
        'csrf-state',
      );
    });

    it('should redirect to frontend with error on failure', async () => {
      mockService.handleSupabaseCallback.mockRejectedValue(
        new Error('Invalid state'),
      );

      await controller.handleSupabaseCallback(
        { code: 'auth-code', state: 'bad-state' },
        mockRes,
      );

      expect(mockRes.redirect).toHaveBeenCalled();
      const redirectUrl = mockRes.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('supabase=error');
      expect(redirectUrl).toContain('message=');
    });
  });
});
