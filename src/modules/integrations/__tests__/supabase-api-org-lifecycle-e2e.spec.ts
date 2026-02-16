import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { BadGatewayException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  createAxiosResponse,
  createMockSupabaseOrganizationsResponse,
} from './supabase-test-helpers';

/**
 * Supabase API Organizations & Lifecycle E2E Tests
 * Story 15-6: AC7 - Organizations listing and project pause/resume
 */
describe('Supabase E2E - API Organizations & Lifecycle Operations', () => {
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

  // ======================== AC7: listOrganizations ========================

  describe('AC7: Supabase listOrganizations', () => {
    it('should list organizations with correct REST API call', async () => {
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse(createMockSupabaseOrganizationsResponse())),
      );

      const result = await supabaseService.listOrganizations('test-token');

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/organizations',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );

      expect(result.organizations).toHaveLength(2);
      expect(result.organizations[0]).toEqual({
        id: 'org-1',
        name: 'My Organization',
      });
    });

    it('should return empty organizations array when API returns 404', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Not Found');
          error.response = { status: 404, data: { message: 'Not found' } };
          return error;
        }),
      );

      const result = await supabaseService.listOrganizations('test-token');

      expect(result).toEqual({ organizations: [] });
    });

    it('should return empty organizations array when API returns non-array', async () => {
      // Mock executeRequest returning a non-array object (e.g. API returns {})
      mockHttpService.get.mockReturnValue(
        of(createAxiosResponse({})),
      );

      const result = await supabaseService.listOrganizations('test-token');

      expect(result).toEqual({ organizations: [] });
    });

    it('should throw BadGatewayException for API errors on listOrganizations', async () => {
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
        supabaseService.listOrganizations('test-token'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  // ======================== AC7: pauseProject ========================

  describe('AC7: Supabase pauseProject', () => {
    it('should pause project with correct REST API call', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({})),
      );

      await supabaseService.pauseProject('test-token', 'proj-ref-1');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects/proj-ref-1/pause',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('should throw BadGatewayException for API errors on pauseProject', async () => {
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
        supabaseService.pauseProject('test-token', 'proj-ref-1'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  // ======================== AC7: resumeProject ========================

  describe('AC7: Supabase resumeProject', () => {
    it('should resume project with correct REST API call', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({})),
      );

      await supabaseService.resumeProject('test-token', 'proj-ref-1');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.supabase.com/v1/projects/proj-ref-1/resume',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('should throw BadGatewayException for API errors on resumeProject', async () => {
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
        supabaseService.resumeProject('test-token', 'proj-ref-1'),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});
