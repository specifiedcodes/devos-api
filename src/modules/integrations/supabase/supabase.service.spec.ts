import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { ConflictException, BadGatewayException } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  let service: SupabaseService;
  let mockHttpService: any;

  const mockToken = 'supabase_test_token';

  const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<SupabaseService>(SupabaseService);
    jest.clearAllMocks();
  });

  describe('createProject', () => {
    const mockProjectResponse = {
      id: 'supabase-project-ref',
      name: 'my-app-db',
      organization_id: 'org-uuid',
      region: 'us-east-1',
      status: 'COMING_UP',
      created_at: '2026-02-01T10:00:00Z',
    };

    it('should call Supabase API with correct REST payload and return project details', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockProjectResponse)),
      );

      const result = await service.createProject(mockToken, {
        name: 'my-app-db',
        organizationId: 'org-uuid',
        region: 'us-east-1',
        dbPassword: 'secure-password-123',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects',
        expect.objectContaining({
          name: 'my-app-db',
          organization_id: 'org-uuid',
          region: 'us-east-1',
          db_pass: 'secure-password-123',
          plan: 'free',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer supabase_test_token',
            'Content-Type': 'application/json',
          }),
        }),
      );

      expect(result.id).toBe('supabase-project-ref');
      expect(result.name).toBe('my-app-db');
      expect(result.organizationId).toBe('org-uuid');
      expect(result.region).toBe('us-east-1');
      expect(result.status).toBe('provisioning');
      expect(result.projectUrl).toBe(
        'https://supabase.com/dashboard/project/supabase-project-ref',
      );
    });

    it('should return ConflictException when project name exists (Supabase 409)', async () => {
      const error = {
        response: {
          status: 409,
          data: { error: { message: 'Project already exists' } },
        },
        message: 'Request failed with status code 409',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.createProject(mockToken, {
          name: 'existing-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-password-123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadGatewayException for Supabase API errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Internal server error' } },
        },
        message: 'Request failed with status code 500',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.createProject(mockToken, {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-password-123',
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should set region and plan when provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse({
            ...mockProjectResponse,
            region: 'eu-west-1',
          }),
        ),
      );

      await service.createProject(mockToken, {
        name: 'my-app-db',
        organizationId: 'org-uuid',
        region: 'eu-west-1',
        dbPassword: 'secure-password-123',
        plan: 'pro',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects',
        expect.objectContaining({
          region: 'eu-west-1',
          plan: 'pro',
        }),
        expect.any(Object),
      );
    });

    it('should use default region (us-east-1) when not provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(mockProjectResponse)),
      );

      await service.createProject(mockToken, {
        name: 'my-app-db',
        organizationId: 'org-uuid',
        dbPassword: 'secure-password-123',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects',
        expect.objectContaining({
          region: 'us-east-1',
        }),
        expect.any(Object),
      );
    });

    it('should throw BadGatewayException for network errors', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(
        service.createProject(mockToken, {
          name: 'my-app-db',
          organizationId: 'org-uuid',
          dbPassword: 'secure-password-123',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('getProject', () => {
    const createProjectResponse = (status: string) => ({
      id: 'supabase-project-ref',
      name: 'my-app-db',
      organization_id: 'org-uuid',
      region: 'us-east-1',
      status,
      created_at: '2026-02-01T10:00:00Z',
      database: {
        host: 'db.supabase-project-ref.supabase.co',
        version: '15.1.0.117',
      },
    });

    it('should return project with mapped status', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createProjectResponse('ACTIVE_HEALTHY'))),
      );

      const result = await service.getProject(
        mockToken,
        'supabase-project-ref',
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe('supabase-project-ref');
      expect(result!.name).toBe('my-app-db');
      expect(result!.status).toBe('active');
      expect(result!.database).toEqual({
        host: 'db.supabase-project-ref.supabase.co',
        version: '15.1.0.117',
      });
    });

    it('should return null for 404', async () => {
      const error = {
        response: {
          status: 404,
          data: { error: { message: 'Project not found' } },
        },
        message: 'Request failed with status code 404',
      };
      mockHttpService.get.mockReturnValue(throwError(() => error));

      const result = await service.getProject(
        mockToken,
        'nonexistent-ref',
      );

      expect(result).toBeNull();
    });

    it('should map all Supabase states correctly', async () => {
      const statusMap: Record<string, string> = {
        COMING_UP: 'provisioning',
        ACTIVE_HEALTHY: 'active',
        ACTIVE_UNHEALTHY: 'unhealthy',
        INACTIVE: 'inactive',
        GOING_DOWN: 'shutting_down',
        INIT_FAILED: 'failed',
        REMOVED: 'removed',
        RESTORING: 'restoring',
        UPGRADING: 'upgrading',
        PAUSING: 'pausing',
        PAUSED: 'paused',
      };

      for (const [supabaseState, expectedStatus] of Object.entries(
        statusMap,
      )) {
        mockHttpService.get.mockReturnValue(
          of(createAxiosResponse(createProjectResponse(supabaseState))),
        );

        const result = await service.getProject(
          mockToken,
          'supabase-project-ref',
        );

        expect(result!.status).toBe(expectedStatus);
      }
    });
  });

  describe('getProjectApiKeys', () => {
    it('should return API keys for project', async () => {
      const mockApiKeys = [
        { name: 'anon', api_key: 'eyJ-anon-key' },
        { name: 'service_role', api_key: 'eyJ-service-role-key' },
      ];
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockApiKeys)),
      );

      const result = await service.getProjectApiKeys(
        mockToken,
        'supabase-project-ref',
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'anon', apiKey: 'eyJ-anon-key' });
      expect(result[1]).toEqual({
        name: 'service_role',
        apiKey: 'eyJ-service-role-key',
      });
    });

    it('should throw BadGatewayException for API errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'API keys fetch failed' } },
        },
        message: 'Request failed with status code 500',
      };
      mockHttpService.get.mockReturnValue(throwError(() => error));

      await expect(
        service.getProjectApiKeys(mockToken, 'supabase-project-ref'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('listOrganizations', () => {
    it('should return organization list', async () => {
      const mockOrgs = [
        { id: 'org-1', name: 'My Organization' },
        { id: 'org-2', name: 'Another Org' },
      ];
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(mockOrgs)),
      );

      const result = await service.listOrganizations(mockToken);

      expect(result.organizations).toHaveLength(2);
      expect(result.organizations[0]).toEqual({
        id: 'org-1',
        name: 'My Organization',
      });
      expect(result.organizations[1]).toEqual({
        id: 'org-2',
        name: 'Another Org',
      });
    });

    it('should throw BadGatewayException for API errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Organizations fetch failed' } },
        },
        message: 'Request failed with status code 500',
      };
      mockHttpService.get.mockReturnValue(throwError(() => error));

      await expect(
        service.listOrganizations(mockToken),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('pauseProject', () => {
    it('should call Supabase REST API to pause', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({})),
      );

      await service.pauseProject(mockToken, 'supabase-project-ref');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects/supabase-project-ref/pause',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer supabase_test_token',
          }),
        }),
      );
    });

    it('should throw BadGatewayException for API errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Pause failed' } },
        },
        message: 'Request failed with status code 500',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.pauseProject(mockToken, 'supabase-project-ref'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('resumeProject', () => {
    it('should call Supabase REST API to resume', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({})),
      );

      await service.resumeProject(mockToken, 'supabase-project-ref');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects/supabase-project-ref/resume',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer supabase_test_token',
          }),
        }),
      );
    });

    it('should throw BadGatewayException for API errors', async () => {
      const error = {
        response: {
          status: 500,
          data: { error: { message: 'Resume failed' } },
        },
        message: 'Request failed with status code 500',
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(
        service.resumeProject(mockToken, 'supabase-project-ref'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('mapProjectStatus (private)', () => {
    // Access private method via cast for thorough status mapping verification
    const callMapStatus = (s: SupabaseService, status: string) =>
      (s as any).mapProjectStatus(status);

    it('should map COMING_UP to provisioning', () => {
      expect(callMapStatus(service, 'COMING_UP')).toBe('provisioning');
    });

    it('should map ACTIVE_HEALTHY to active', () => {
      expect(callMapStatus(service, 'ACTIVE_HEALTHY')).toBe('active');
    });

    it('should map ACTIVE_UNHEALTHY to unhealthy', () => {
      expect(callMapStatus(service, 'ACTIVE_UNHEALTHY')).toBe('unhealthy');
    });

    it('should map INACTIVE to inactive', () => {
      expect(callMapStatus(service, 'INACTIVE')).toBe('inactive');
    });

    it('should map GOING_DOWN to shutting_down', () => {
      expect(callMapStatus(service, 'GOING_DOWN')).toBe('shutting_down');
    });

    it('should map INIT_FAILED to failed', () => {
      expect(callMapStatus(service, 'INIT_FAILED')).toBe('failed');
    });

    it('should map REMOVED to removed', () => {
      expect(callMapStatus(service, 'REMOVED')).toBe('removed');
    });

    it('should map RESTORING to restoring', () => {
      expect(callMapStatus(service, 'RESTORING')).toBe('restoring');
    });

    it('should map UPGRADING to upgrading', () => {
      expect(callMapStatus(service, 'UPGRADING')).toBe('upgrading');
    });

    it('should map PAUSING to pausing', () => {
      expect(callMapStatus(service, 'PAUSING')).toBe('pausing');
    });

    it('should map PAUSED to paused', () => {
      expect(callMapStatus(service, 'PAUSED')).toBe('paused');
    });

    it('should return "unknown" for unknown statuses', () => {
      expect(callMapStatus(service, 'SOME_NEW_STATUS')).toBe('unknown');
    });
  });
});
