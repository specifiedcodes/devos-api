import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScimSyncLogService } from '../scim-sync-log.service';
import { ScimSyncLog, ScimOperation, ScimResourceType, ScimSyncStatus } from '../../../../database/entities/scim-sync-log.entity';

describe('ScimSyncLogService', () => {
  let service: ScimSyncLogService;

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';

  const mockSyncLogRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScimSyncLogService,
        { provide: getRepositoryToken(ScimSyncLog), useValue: mockSyncLogRepository },
      ],
    }).compile();

    service = module.get<ScimSyncLogService>(ScimSyncLogService);
  });

  describe('log', () => {
    it('should create sync log entry with all fields', async () => {
      const entry = { id: 'log-1', workspaceId, operation: ScimOperation.CREATE_USER, resourceType: ScimResourceType.USER, status: ScimSyncStatus.SUCCESS };
      mockSyncLogRepository.create.mockReturnValue(entry);
      mockSyncLogRepository.save.mockResolvedValue(entry);

      const result = await service.log({
        workspaceId,
        operation: ScimOperation.CREATE_USER,
        resourceType: ScimResourceType.USER,
        resourceId: 'user-1',
        externalId: 'ext-1',
        status: ScimSyncStatus.SUCCESS,
        ipAddress: '127.0.0.1',
      });

      expect(mockSyncLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          operation: ScimOperation.CREATE_USER,
          resourceType: ScimResourceType.USER,
          resourceId: 'user-1',
          externalId: 'ext-1',
          status: ScimSyncStatus.SUCCESS,
        }),
      );
    });

    it('should handle fire-and-forget (never throws)', async () => {
      mockSyncLogRepository.create.mockImplementation(() => { throw new Error('DB error'); });

      const result = await service.log({
        workspaceId,
        operation: ScimOperation.CREATE_USER,
        resourceType: ScimResourceType.USER,
        status: ScimSyncStatus.SUCCESS,
      });

      // Should not throw, returns empty object
      expect(result).toBeDefined();
    });

    it('should sanitize request body (removes password fields)', async () => {
      const entry = { id: 'log-1' };
      mockSyncLogRepository.create.mockReturnValue(entry);
      mockSyncLogRepository.save.mockResolvedValue(entry);

      await service.log({
        workspaceId,
        operation: ScimOperation.CREATE_USER,
        resourceType: ScimResourceType.USER,
        status: ScimSyncStatus.SUCCESS,
        requestBody: { userName: 'john@test.com', password: 'secret123' },
      });

      const createCall = mockSyncLogRepository.create.mock.calls[0][0];
      expect(createCall.requestBody.password).toBe('[REDACTED]');
      expect(createCall.requestBody.userName).toBe('john@test.com');
    });
  });

  describe('listLogs', () => {
    it('should list logs with pagination', async () => {
      const logs = [{ id: 'log-1' }, { id: 'log-2' }];
      mockSyncLogRepository.findAndCount.mockResolvedValue([logs, 10]);

      const result = await service.listLogs(workspaceId, { page: 1, limit: 2 });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('should filter by resourceType', async () => {
      mockSyncLogRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.listLogs(workspaceId, { resourceType: 'user' });

      expect(mockSyncLogRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resourceType: 'user' }),
        }),
      );
    });

    it('should filter by operation', async () => {
      mockSyncLogRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.listLogs(workspaceId, { operation: 'create_user' });

      expect(mockSyncLogRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ operation: 'create_user' }),
        }),
      );
    });

    it('should filter by status', async () => {
      mockSyncLogRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.listLogs(workspaceId, { status: 'failure' });

      expect(mockSyncLogRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'failure' }),
        }),
      );
    });

    it('should return correct total count with pagination', async () => {
      mockSyncLogRepository.findAndCount.mockResolvedValue([[], 42]);

      const result = await service.listLogs(workspaceId, { page: 5, limit: 10 });

      expect(result.total).toBe(42);
    });

    it('should default to page 1 and limit 50', async () => {
      mockSyncLogRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.listLogs(workspaceId);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should cap limit at 200', async () => {
      mockSyncLogRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.listLogs(workspaceId, { limit: 999 });

      expect(result.limit).toBe(200);
    });
  });
});
