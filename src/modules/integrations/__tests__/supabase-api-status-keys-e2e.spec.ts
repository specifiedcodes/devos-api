import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { BadGatewayException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  MOCK_SUPABASE_PROJECT_REF,
  createAxiosResponse,
  createMockSupabaseProjectResponse,
  createMockSupabaseApiKeysResponse,
} from './supabase-test-helpers';

/**
 * Supabase API Status & API Keys E2E Tests
 * Story 15-6: AC6 - Project status and API key operations
 */
describe('Supabase E2E - API Status & Keys Operations', () => {
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

  // ======================== AC6: getProject ========================

  describe('AC6: Supabase getProject', () => {
    it('should get project with correct REST API call', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockSupabaseProjectResponse())),
      );

      const result = await supabaseService.getProject(
        'test-token',
        'proj-ref-1',
      );

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects/proj-ref-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe(MOCK_SUPABASE_PROJECT_REF);
      expect(result!.name).toBe('my-app-db');
      expect(result!.status).toBeDefined();
      expect(result!.region).toBe('us-east-1');
      expect(result!.projectUrl).toBeDefined();
    });

    it('should return null for not-found project (404)', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Not Found');
          error.response = { status: 404, data: { message: 'Not found' } };
          return error;
        }),
      );

      const result = await supabaseService.getProject(
        'test-token',
        'nonexistent',
      );

      expect(result).toBeNull();
    });

    it.each([
      ['COMING_UP', 'provisioning'],
      ['ACTIVE_HEALTHY', 'active'],
      ['ACTIVE_UNHEALTHY', 'unhealthy'],
      ['INACTIVE', 'inactive'],
      ['GOING_DOWN', 'shutting_down'],
      ['INIT_FAILED', 'failed'],
      ['REMOVED', 'removed'],
      ['RESTORING', 'restoring'],
      ['UPGRADING', 'upgrading'],
      ['PAUSING', 'pausing'],
      ['PAUSED', 'paused'],
    ])(
      'should map Supabase status %s to %s',
      async (supabaseStatus, expectedStatus) => {
        mockHttpService.get.mockReturnValue(
          of(
            createAxiosResponse(
              createMockSupabaseProjectResponse({ status: supabaseStatus }),
            ),
          ),
        );

        const result = await supabaseService.getProject('test-token', 'proj-ref');

        expect(result!.status).toBe(expectedStatus);
      },
    );

    it('should map unknown status to unknown', async () => {
      mockHttpService.get.mockReturnValue(
        of(
          createAxiosResponse(
            createMockSupabaseProjectResponse({
              status: 'SOME_NEW_STATUS',
            }),
          ),
        ),
      );

      const result = await supabaseService.getProject('test-token', 'proj-ref');

      expect(result!.status).toBe('unknown');
    });

    it('should include database field when present in response', async () => {
      mockHttpService.get.mockReturnValue(
        of(
          createAxiosResponse(
            createMockSupabaseProjectResponse({
              database: { host: 'db.ref.supabase.co', version: '15.1.0.117' },
            }),
          ),
        ),
      );

      const result = await supabaseService.getProject('test-token', 'proj-ref');

      expect(result!.database).toBeDefined();
      expect(result!.database!.host).toBe('db.ref.supabase.co');
      expect(result!.database!.version).toBe('15.1.0.117');
    });

    it('should set database to undefined when not present', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockSupabaseProjectResponse())),
      );

      const result = await supabaseService.getProject('test-token', 'proj-ref');

      expect(result!.database).toBeUndefined();
    });
  });

  // ======================== AC6: getProjectApiKeys ========================

  describe('AC6: Supabase getProjectApiKeys', () => {
    it('should get project API keys with correct REST API call', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockSupabaseApiKeysResponse())),
      );

      const result = await supabaseService.getProjectApiKeys(
        'test-token',
        'proj-ref-1',
      );

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects/proj-ref-1/api-keys',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'anon',
        apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon',
      });
      expect(result[1]).toEqual({
        name: 'service_role',
        apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role',
      });
    });

    it('should return empty array when API keys response is null', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Not Found');
          error.response = { status: 404, data: { message: 'Not found' } };
          return error;
        }),
      );

      const result = await supabaseService.getProjectApiKeys(
        'test-token',
        'proj-ref-1',
      );

      expect(result).toEqual([]);
    });

    it('should return empty array when API keys response is non-array', async () => {
      // Mock executeRequest returning a non-array object
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse({})),
      );

      const result = await supabaseService.getProjectApiKeys(
        'test-token',
        'proj-ref-1',
      );

      expect(result).toEqual([]);
    });

    it('should throw BadGatewayException for API errors on getProjectApiKeys', async () => {
      mockHttpService.get.mockReturnValue(
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
        supabaseService.getProjectApiKeys('test-token', 'proj-ref-1'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for rate limit (429)', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Rate Limited');
          error.response = {
            status: 429,
            data: { message: 'Too many requests' },
          };
          return error;
        }),
      );

      await expect(
        supabaseService.getProject('test-token', 'proj-ref-1'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException with rate limit message for 429', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Rate Limited');
          error.response = {
            status: 429,
            data: { message: 'Too many requests' },
          };
          return error;
        }),
      );

      await expect(
        supabaseService.getProject('test-token', 'proj-ref-1'),
      ).rejects.toThrow('Supabase API rate limit exceeded');
    });
  });
});
