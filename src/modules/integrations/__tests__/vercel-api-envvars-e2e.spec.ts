import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { BadGatewayException } from '@nestjs/common';
import { VercelService } from '../vercel/vercel.service';
import {
  MOCK_VERCEL_PROJECT_ID,
  createAxiosResponse,
} from './vercel-test-helpers';

/**
 * Vercel API Environment Variables E2E Tests
 * Story 15-5: AC7 - Environment variable management via REST API
 */
describe('Vercel E2E - API Environment Variables', () => {
  let vercelService: VercelService;
  let mockHttpService: any;

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VercelService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    vercelService = module.get<VercelService>(VercelService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC7: Vercel Environment Variable Upsert', () => {
    it('should upsert environment variables with correct REST API call', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({ created: true })),
      );

      await vercelService.upsertEnvironmentVariables(
        'test-token',
        MOCK_VERCEL_PROJECT_ID,
        [
          {
            key: 'DATABASE_URL',
            value: 'postgres://...',
            target: ['production', 'preview'],
            type: 'encrypted',
          },
        ],
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        `https://api.vercel.com/v10/projects/${MOCK_VERCEL_PROJECT_ID}/env`,
        expect.arrayContaining([
          expect.objectContaining({
            key: 'DATABASE_URL',
            value: 'postgres://...',
            target: ['production', 'preview'],
            type: 'encrypted',
          }),
        ]),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should use default target and type when not specified', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({ created: true })),
      );

      await vercelService.upsertEnvironmentVariables(
        'test-token',
        MOCK_VERCEL_PROJECT_ID,
        [{ key: 'NODE_ENV', value: 'production' }],
      );

      const requestBody = mockHttpService.post.mock.calls[0][1];
      expect(requestBody[0].target).toEqual([
        'production',
        'preview',
        'development',
      ]);
      expect(requestBody[0].type).toBe('encrypted');
    });

    it('should handle multiple variables in a single request', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({ created: true })),
      );

      await vercelService.upsertEnvironmentVariables(
        'test-token',
        MOCK_VERCEL_PROJECT_ID,
        [
          { key: 'VAR_1', value: 'value1' },
          { key: 'VAR_2', value: 'value2' },
          { key: 'VAR_3', value: 'value3' },
        ],
      );

      const requestBody = mockHttpService.post.mock.calls[0][1];
      expect(requestBody).toHaveLength(3);
      expect(requestBody[0].key).toBe('VAR_1');
      expect(requestBody[1].key).toBe('VAR_2');
      expect(requestBody[2].key).toBe('VAR_3');
    });

    it('should throw BadGatewayException for Vercel API errors on env var upsert', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Server Error');
          error.response = {
            status: 500,
            data: { error: { message: 'Internal error' } },
          };
          return error;
        }),
      );

      await expect(
        vercelService.upsertEnvironmentVariables(
          'test-token',
          MOCK_VERCEL_PROJECT_ID,
          [{ key: 'VAR', value: 'value' }],
        ),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should handle rate limit (429) on env var operations', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Rate Limited');
          error.response = {
            status: 429,
            data: { error: { message: 'Rate limit exceeded' } },
          };
          return error;
        }),
      );

      await expect(
        vercelService.upsertEnvironmentVariables(
          'test-token',
          MOCK_VERCEL_PROJECT_ID,
          [{ key: 'VAR', value: 'value' }],
        ),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});
