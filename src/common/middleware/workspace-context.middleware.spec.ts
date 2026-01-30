import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkspaceContextMiddleware } from './workspace-context.middleware';
import { TenantConnectionService } from '../../database/services/tenant-connection.service';
import { Workspace } from '../../database/entities/workspace.entity';

describe('WorkspaceContextMiddleware', () => {
  let middleware: WorkspaceContextMiddleware;
  let tenantConnectionService: TenantConnectionService;
  let workspaceRepository: Repository<Workspace>;
  let mockRequest: Partial<Request> & { workspaceContext?: any };
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let finishCallback: (() => void) | undefined;

  beforeEach(async () => {
    mockRequest = {
      headers: {},
    } as Partial<Request> & { workspaceContext?: any };

    mockResponse = {
      on: jest.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
        return mockResponse as Response;
      }),
    } as Partial<Response>;

    mockNext = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceContextMiddleware,
        {
          provide: TenantConnectionService,
          useValue: {
            setWorkspaceContext: jest.fn().mockResolvedValue(undefined),
            resetContext: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(Workspace),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    middleware = module.get<WorkspaceContextMiddleware>(WorkspaceContextMiddleware);
    tenantConnectionService = module.get<TenantConnectionService>(TenantConnectionService);
    workspaceRepository = module.get<Repository<Workspace>>(getRepositoryToken(Workspace));
  });

  afterEach(() => {
    jest.clearAllMocks();
    finishCallback = undefined;
  });

  describe('Middleware Initialization', () => {
    it('should be defined', () => {
      expect(middleware).toBeDefined();
    });

    it('should have TenantConnectionService injected', () => {
      expect(middleware['tenantConnectionService']).toBeDefined();
    });

    it('should have WorkspaceRepository injected', () => {
      expect(middleware['workspaceRepository']).toBeDefined();
    });
  });

  describe('Request with workspace ID header', () => {
    it('should set workspace context when x-workspace-id header is present', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      const workspace = {
        id: workspaceId,
        schemaName: 'workspace_550e8400_e29b_41d4_a716_446655440000',
      };

      mockRequest.headers = { 'x-workspace-id': workspaceId };
      jest.spyOn(workspaceRepository, 'findOne').mockResolvedValue(workspace as Workspace);

      await middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(workspaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: workspaceId },
      });
      expect(tenantConnectionService.setWorkspaceContext).toHaveBeenCalledWith(
        workspace.schemaName,
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should store workspace context in request object', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      const workspace = {
        id: workspaceId,
        schemaName: 'workspace_550e8400_e29b_41d4_a716_446655440000',
      };

      mockRequest.headers = { 'x-workspace-id': workspaceId };
      jest.spyOn(workspaceRepository, 'findOne').mockResolvedValue(workspace as Workspace);

      await middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.workspaceContext).toEqual({
        workspaceId: workspace.id,
        schemaName: workspace.schemaName,
      });
    });

    it('should not set context if workspace is not found', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';

      mockRequest.headers = { 'x-workspace-id': workspaceId };
      jest.spyOn(workspaceRepository, 'findOne').mockResolvedValue(null);

      await middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(workspaceRepository.findOne).toHaveBeenCalled();
      expect(tenantConnectionService.setWorkspaceContext).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Request without workspace ID header', () => {
    it('should skip context setting when no x-workspace-id header', async () => {
      mockRequest.headers = {};

      await middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(workspaceRepository.findOne).not.toHaveBeenCalled();
      expect(tenantConnectionService.setWorkspaceContext).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not set workspaceContext in request when no header', async () => {
      mockRequest.headers = {};

      await middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.workspaceContext).toBeUndefined();
    });
  });

  describe('Response cleanup', () => {
    it('should register finish event handler on response', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      const workspace = {
        id: workspaceId,
        schemaName: 'workspace_abc',
      };

      mockRequest.headers = { 'x-workspace-id': workspaceId };
      jest.spyOn(workspaceRepository, 'findOne').mockResolvedValue(workspace as Workspace);

      await middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should reset context after response finishes', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      const workspace = {
        id: workspaceId,
        schemaName: 'workspace_abc',
      };

      mockRequest.headers = { 'x-workspace-id': workspaceId };
      jest.spyOn(workspaceRepository, 'findOne').mockResolvedValue(workspace as Workspace);

      await middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response finish
      if (finishCallback) {
        await finishCallback();
      }

      expect(tenantConnectionService.resetContext).toHaveBeenCalled();
    });

    it('should reset context even when no workspace was set', async () => {
      mockRequest.headers = {};

      await middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response finish
      if (finishCallback) {
        await finishCallback();
      }

      expect(tenantConnectionService.resetContext).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = { 'x-workspace-id': workspaceId };

      jest.spyOn(workspaceRepository, 'findOne').mockRejectedValue(new Error('DB Error'));

      await expect(
        middleware.use(mockRequest as Request, mockResponse as Response, mockNext),
      ).rejects.toThrow('DB Error');
    });

    it('should handle invalid workspace ID format', async () => {
      const invalidWorkspaceId = 'not-a-valid-uuid';
      mockRequest.headers = { 'x-workspace-id': invalidWorkspaceId };

      jest.spyOn(workspaceRepository, 'findOne').mockResolvedValue(null);

      await middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(tenantConnectionService.setWorkspaceContext).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
