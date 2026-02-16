import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ConflictException, BadGatewayException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  MOCK_SUPABASE_PROJECT_REF,
  createAxiosResponse,
  createMockSupabaseProjectResponse,
} from './supabase-test-helpers';

/**
 * Supabase API Project Operations E2E Tests
 * Story 15-6: AC5 - Project creation via REST API
 */
describe('Supabase E2E - API Project Operations', () => {
  let supabaseService: SupabaseService;
  let mockHttpService: any;

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    supabaseService = module.get<SupabaseService>(SupabaseService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC5: Supabase Project Creation', () => {
    it('should create project with correct REST API call', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockSupabaseProjectResponse())),
      );

      const result = await supabaseService.createProject('test-token', {
        name: 'my-app-db',
        organizationId: 'org-uuid',
        region: 'us-east-1',
        dbPassword: 'secure-pass',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects',
        expect.objectContaining({
          name: 'my-app-db',
          organization_id: 'org-uuid',
          region: 'us-east-1',
          db_pass: 'secure-pass',
          plan: 'free',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      );

      expect(result.id).toBe(MOCK_SUPABASE_PROJECT_REF);
      expect(result.name).toBe('my-app-db');
      expect(result.organizationId).toBe('org-uuid-1');
      expect(result.region).toBe('us-east-1');
      expect(result.createdAt).toBeDefined();
    });

    it('should format projectUrl correctly', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockSupabaseProjectResponse())),
      );

      const result = await supabaseService.createProject('test-token', {
        name: 'my-app-db',
        organizationId: 'org-uuid',
        dbPassword: 'pass',
      });

      expect(result.projectUrl).toBe(
        `https://supabase.com/dashboard/project/${MOCK_SUPABASE_PROJECT_REF}`,
      );
    });

    it('should map COMING_UP status to provisioning', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse(
            createMockSupabaseProjectResponse({ status: 'COMING_UP' }),
          ),
        ),
      );

      const result = await supabaseService.createProject('test-token', {
        name: 'my-app-db',
        organizationId: 'org-uuid',
        dbPassword: 'pass',
      });

      expect(result.status).toBe('provisioning');
    });

    it('should use default region when not provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockSupabaseProjectResponse())),
      );

      await supabaseService.createProject('test-token', {
        name: 'my-app',
        organizationId: 'org-uuid',
        dbPassword: 'pass',
      });

      const requestBody = mockHttpService.post.mock.calls[0][1];
      expect(requestBody.region).toBe('us-east-1');
    });

    it('should use default plan when not provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockSupabaseProjectResponse())),
      );

      await supabaseService.createProject('test-token', {
        name: 'my-app',
        organizationId: 'org-uuid',
        dbPassword: 'pass',
      });

      const requestBody = mockHttpService.post.mock.calls[0][1];
      expect(requestBody.plan).toBe('free');
    });

    it('should use provided region and plan', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockSupabaseProjectResponse())),
      );

      await supabaseService.createProject('test-token', {
        name: 'my-app',
        organizationId: 'org-uuid',
        region: 'eu-west-1',
        dbPassword: 'pass',
        plan: 'pro',
      });

      const requestBody = mockHttpService.post.mock.calls[0][1];
      expect(requestBody.region).toBe('eu-west-1');
      expect(requestBody.plan).toBe('pro');
    });

    it('should throw ConflictException when Supabase returns 409', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Conflict');
          error.response = {
            status: 409,
            data: { message: 'Project already exists' },
          };
          return error;
        }),
      );

      await expect(
        supabaseService.createProject('test-token', {
          name: 'existing-db',
          organizationId: 'org-uuid',
          dbPassword: 'pass',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadGatewayException for generic Supabase API errors', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Server Error');
          error.response = {
            status: 500,
            data: { message: 'Internal server error' },
          };
          return error;
        }),
      );

      await expect(
        supabaseService.createProject('test-token', {
          name: 'my-app',
          organizationId: 'org-uuid',
          dbPassword: 'pass',
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for network errors', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(
        supabaseService.createProject('test-token', {
          name: 'my-app',
          organizationId: 'org-uuid',
          dbPassword: 'pass',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});
