import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { BadGatewayException } from '@nestjs/common';
import { RailwayService } from '../railway/railway.service';
import { createAxiosResponse } from './railway-test-helpers';

/**
 * Railway API Environment Variables E2E Tests
 * Story 15-4: AC7 - Environment variable management via GraphQL API
 */
describe('Railway E2E - API Environment Variables Operations', () => {
  let railwayService: RailwayService;
  let mockHttpService: any;

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    railwayService = module.get<RailwayService>(RailwayService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC7: Railway Environment Variables Operations', () => {
    it('should upsert environment variables with correct GraphQL mutation', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({ data: { variableCollectionUpsert: true } })),
      );

      await railwayService.upsertEnvironmentVariables(
        'test-token',
        'proj-1',
        'env-1',
        { DATABASE_URL: 'postgres://...', NODE_ENV: 'production' },
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://backboard.railway.app/graphql/v2',
        expect.objectContaining({
          query: expect.stringContaining('variableCollectionUpsert'),
          variables: {
            input: {
              projectId: 'proj-1',
              environmentId: 'env-1',
              variables: {
                DATABASE_URL: 'postgres://...',
                NODE_ENV: 'production',
              },
            },
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should include projectId, environmentId, and variables in GraphQL variables', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse({ data: { variableCollectionUpsert: true } })),
      );

      await railwayService.upsertEnvironmentVariables(
        'test-token',
        'proj-abc',
        'env-xyz',
        { API_KEY: 'secret123' },
      );

      const callArgs = mockHttpService.post.mock.calls[0];
      const variables = callArgs[1].variables;
      expect(variables.input.projectId).toBe('proj-abc');
      expect(variables.input.environmentId).toBe('env-xyz');
      expect(variables.input.variables).toEqual({ API_KEY: 'secret123' });
    });

    it('should throw BadGatewayException for Railway API errors on env var upsert', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Server error');
          error.response = { status: 500 };
          return error;
        }),
      );

      await expect(
        railwayService.upsertEnvironmentVariables(
          'test-token',
          'proj-1',
          'env-1',
          { KEY: 'value' },
        ),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should handle rate limit (429) on env var operations', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Rate limit exceeded');
          error.response = { status: 429 };
          return error;
        }),
      );

      await expect(
        railwayService.upsertEnvironmentVariables(
          'test-token',
          'proj-1',
          'env-1',
          { KEY: 'value' },
        ),
      ).rejects.toThrow(expect.objectContaining({
        message: expect.stringContaining('rate limit'),
      }));
    });
  });
});
