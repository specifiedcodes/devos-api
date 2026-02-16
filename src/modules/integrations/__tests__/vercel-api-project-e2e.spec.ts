import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ConflictException, BadGatewayException } from '@nestjs/common';
import { VercelService } from '../vercel/vercel.service';
import {
  MOCK_VERCEL_PROJECT_ID,
  createAxiosResponse,
  createMockVercelProjectResponse,
} from './vercel-test-helpers';

/**
 * Vercel API Project Operations E2E Tests
 * Story 15-5: AC5 - Project creation via REST API
 */
describe('Vercel E2E - API Project Operations', () => {
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

  describe('AC5: Vercel Project Creation', () => {
    it('should create project with correct REST API call', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockVercelProjectResponse())),
      );

      const result = await vercelService.createProject('test-token', {
        name: 'my-app',
        framework: 'nextjs',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://api.vercel.com/v9/projects',
        expect.objectContaining({
          name: 'my-app',
          framework: 'nextjs',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      );

      expect(result.id).toBe(MOCK_VERCEL_PROJECT_ID);
      expect(result.name).toBe('my-app');
      expect(result.framework).toBe('nextjs');
      expect(result.createdAt).toBeDefined();
    });

    it('should format projectUrl correctly', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockVercelProjectResponse({ name: 'my-app' }))),
      );

      const result = await vercelService.createProject('test-token', {
        name: 'my-app',
      });

      expect(result.projectUrl).toBe('https://vercel.com/~/projects/my-app');
    });

    it('should set latestDeploymentUrl when latestDeployments[0].url exists', async () => {
      mockHttpService.post.mockReturnValue(
        of(
          createAxiosResponse(
            createMockVercelProjectResponse({
              latestDeployments: [{ url: 'my-app-abc.vercel.app' }],
            }),
          ),
        ),
      );

      const result = await vercelService.createProject('test-token', {
        name: 'my-app',
      });

      expect(result.latestDeploymentUrl).toBe('https://my-app-abc.vercel.app');
    });

    it('should include gitRepository when provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockVercelProjectResponse())),
      );

      await vercelService.createProject('test-token', {
        name: 'my-app',
        gitRepository: { type: 'github', repo: 'owner/repo' },
      });

      const requestBody = mockHttpService.post.mock.calls[0][1];
      expect(requestBody.gitRepository).toEqual({
        type: 'github',
        repo: 'owner/repo',
      });
    });

    it('should omit gitRepository when not provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockVercelProjectResponse())),
      );

      await vercelService.createProject('test-token', {
        name: 'my-app',
      });

      const requestBody = mockHttpService.post.mock.calls[0][1];
      expect(requestBody).not.toHaveProperty('gitRepository');
    });

    it('should include optional build configuration fields when provided', async () => {
      mockHttpService.post.mockReturnValue(
        of(createAxiosResponse(createMockVercelProjectResponse())),
      );

      await vercelService.createProject('test-token', {
        name: 'my-app',
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
        installCommand: 'npm ci',
      });

      const requestBody = mockHttpService.post.mock.calls[0][1];
      expect(requestBody.buildCommand).toBe('npm run build');
      expect(requestBody.outputDirectory).toBe('dist');
      expect(requestBody.installCommand).toBe('npm ci');
    });

    it('should throw ConflictException when Vercel returns 409', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Conflict');
          error.response = {
            status: 409,
            data: { error: { message: 'Project already exists' } },
          };
          return error;
        }),
      );

      await expect(
        vercelService.createProject('test-token', { name: 'existing-app' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadGatewayException for generic Vercel API errors', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => {
          const error: any = new Error('Server Error');
          error.response = {
            status: 500,
            data: { error: { message: 'Internal server error' } },
          };
          return error;
        }),
      );

      await expect(
        vercelService.createProject('test-token', { name: 'my-app' }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for network errors', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(
        vercelService.createProject('test-token', { name: 'my-app' }),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});
