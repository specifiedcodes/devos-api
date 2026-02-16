import { Test, TestingModule } from '@nestjs/testing';
import { ScimUserController } from '../scim-user.controller';
import { ScimUserService } from '../scim-user.service';
import { ScimAuthGuard } from '../guards/scim-auth.guard';
import { SCIM_CONSTANTS } from '../../constants/scim.constants';

describe('ScimUserController', () => {
  let controller: ScimUserController;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '550e8400-e29b-41d4-a716-446655440001';

  const mockScimUserService = {
    listUsers: jest.fn(),
    getUser: jest.fn(),
    createUser: jest.fn(),
    replaceUser: jest.fn(),
    patchUser: jest.fn(),
    deleteUser: jest.fn(),
  };

  const createMockResponse = () => ({
    setHeader: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  });

  const createMockRequest = () => ({
    scimWorkspaceId: workspaceId,
    scimConfig: { workspaceId, enabled: true, defaultRole: 'developer' },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScimUserController],
      providers: [
        { provide: ScimUserService, useValue: mockScimUserService },
      ],
    })
      .overrideGuard(ScimAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ScimUserController>(ScimUserController);
  });

  describe('GET /scim/v2/Users', () => {
    it('should return SCIM ListResponse with workspace users', async () => {
      const listResponse = {
        schemas: [SCIM_CONSTANTS.SCHEMAS.LIST_RESPONSE],
        totalResults: 1,
        startIndex: 1,
        itemsPerPage: 1,
        Resources: [{ id: userId, userName: 'john@test.com' }],
      };
      mockScimUserService.listUsers.mockResolvedValue(listResponse);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.listUsers(req as any, res as any);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(listResponse);
    });

    it('should pass filter, startIndex, count to service', async () => {
      mockScimUserService.listUsers.mockResolvedValue({ schemas: [], totalResults: 0, startIndex: 1, itemsPerPage: 0, Resources: [] });
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.listUsers(req as any, res as any, 'userName eq "john"', '5', '10');

      expect(mockScimUserService.listUsers).toHaveBeenCalledWith(
        workspaceId, 'userName eq "john"', 5, 10, undefined, undefined,
      );
    });
  });

  describe('GET /scim/v2/Users/:id', () => {
    it('should return single user in SCIM format', async () => {
      const user = { id: userId, userName: 'john@test.com', schemas: [SCIM_CONSTANTS.SCHEMAS.USER] };
      mockScimUserService.getUser.mockResolvedValue(user);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.getUser(userId, req as any, res as any);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
      expect(res.json).toHaveBeenCalledWith(user);
    });
  });

  describe('POST /scim/v2/Users', () => {
    it('should create user and return 201', async () => {
      const created = { id: userId, userName: 'john@test.com', schemas: [SCIM_CONSTANTS.SCHEMAS.USER] };
      mockScimUserService.createUser.mockResolvedValue(created);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.createUser(
        { schemas: [], userName: 'john@test.com', active: true },
        req as any,
        res as any,
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.setHeader).toHaveBeenCalledWith('Location', `/scim/v2/Users/${userId}`);
      expect(res.json).toHaveBeenCalledWith(created);
    });
  });

  describe('PUT /scim/v2/Users/:id', () => {
    it('should replace user attributes', async () => {
      const replaced = { id: userId, userName: 'john@test.com' };
      mockScimUserService.replaceUser.mockResolvedValue(replaced);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.replaceUser(
        userId,
        { schemas: [], userName: 'john@test.com', active: true },
        req as any,
        res as any,
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(replaced);
    });
  });

  describe('PATCH /scim/v2/Users/:id', () => {
    it('should patch user attributes', async () => {
      const patched = { id: userId, userName: 'john@test.com' };
      mockScimUserService.patchUser.mockResolvedValue(patched);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.patchUser(
        userId,
        { schemas: [], Operations: [{ op: 'replace', path: 'active', value: false }] },
        req as any,
        res as any,
      );

      expect(res.json).toHaveBeenCalledWith(patched);
    });
  });

  describe('DELETE /scim/v2/Users/:id', () => {
    it('should deactivate user and return 204', async () => {
      mockScimUserService.deleteUser.mockResolvedValue(undefined);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.deleteUser(userId, req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('Content-Type', () => {
    it('should set Content-Type to application/scim+json for all responses', async () => {
      mockScimUserService.listUsers.mockResolvedValue({ schemas: [], totalResults: 0, startIndex: 1, itemsPerPage: 0, Resources: [] });
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.listUsers(req as any, res as any);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/scim+json');
    });
  });
});
