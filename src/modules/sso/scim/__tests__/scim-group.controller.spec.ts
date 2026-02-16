import { Test, TestingModule } from '@nestjs/testing';
import { ScimGroupController } from '../scim-group.controller';
import { ScimGroupService } from '../scim-group.service';
import { ScimAuthGuard } from '../guards/scim-auth.guard';
import { SCIM_CONSTANTS } from '../../constants/scim.constants';

describe('ScimGroupController', () => {
  let controller: ScimGroupController;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const groupId = '550e8400-e29b-41d4-a716-446655440010';

  const mockScimGroupService = {
    listGroups: jest.fn(),
    getGroup: jest.fn(),
    createGroup: jest.fn(),
    patchGroup: jest.fn(),
    deleteGroup: jest.fn(),
  };

  const createMockResponse = () => ({
    setHeader: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  });

  const createMockRequest = () => ({
    scimWorkspaceId: workspaceId,
    scimConfig: { workspaceId, enabled: true },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScimGroupController],
      providers: [
        { provide: ScimGroupService, useValue: mockScimGroupService },
      ],
    })
      .overrideGuard(ScimAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ScimGroupController>(ScimGroupController);
  });

  describe('GET /scim/v2/Groups', () => {
    it('should return SCIM ListResponse with workspace groups', async () => {
      const listResponse = {
        schemas: [SCIM_CONSTANTS.SCHEMAS.LIST_RESPONSE],
        totalResults: 1,
        startIndex: 1,
        itemsPerPage: 1,
        Resources: [{ id: groupId, displayName: 'Engineering' }],
      };
      mockScimGroupService.listGroups.mockResolvedValue(listResponse);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.listGroups(req as any, res as any);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('GET /scim/v2/Groups/:id', () => {
    it('should return single group with members', async () => {
      const group = { id: groupId, displayName: 'Engineering', members: [] };
      mockScimGroupService.getGroup.mockResolvedValue(group);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.getGroup(groupId, req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(group);
    });
  });

  describe('POST /scim/v2/Groups', () => {
    it('should create group and return 201', async () => {
      const created = { id: groupId, displayName: 'Engineering' };
      mockScimGroupService.createGroup.mockResolvedValue(created);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.createGroup(
        { schemas: [], displayName: 'Engineering', externalId: 'eng-1' },
        req as any,
        res as any,
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.setHeader).toHaveBeenCalledWith('Location', `/scim/v2/Groups/${groupId}`);
    });
  });

  describe('PATCH /scim/v2/Groups/:id', () => {
    it('should patch group and return result', async () => {
      const patched = { id: groupId, displayName: 'New Name' };
      mockScimGroupService.patchGroup.mockResolvedValue(patched);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.patchGroup(
        groupId,
        { schemas: [], Operations: [{ op: 'replace', path: 'displayName', value: 'New Name' }] },
        req as any,
        res as any,
      );

      expect(res.json).toHaveBeenCalledWith(patched);
    });
  });

  describe('DELETE /scim/v2/Groups/:id', () => {
    it('should delete group and return 204', async () => {
      mockScimGroupService.deleteGroup.mockResolvedValue(undefined);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.deleteGroup(groupId, req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('Content-Type', () => {
    it('should set Content-Type to application/scim+json', async () => {
      mockScimGroupService.listGroups.mockResolvedValue({ schemas: [], totalResults: 0, startIndex: 1, itemsPerPage: 0, Resources: [] });
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.listGroups(req as any, res as any);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/scim+json');
    });
  });
});
