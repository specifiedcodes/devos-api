import { Test, TestingModule } from '@nestjs/testing';
import { CliSessionsController, CliSessionsInternalController } from '../cli-sessions.controller';
import { CliSessionsService } from '../cli-sessions.service';
import { CliSessionArchiveService } from '../cli-session-archive.service';
import { CliSessionArchiveSchedulerService } from '../cli-session-archive-scheduler.service';
import { CliSessionStatus, CliSessionAgentType } from '../../../database/entities/cli-session.entity';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { WorkspaceAdminGuard } from '../../workspaces/guards/workspace-admin.guard';
import { ServiceAuthGuard } from '../../../shared/guards/service-auth.guard';

// Mock guards
const mockGuard = { canActivate: jest.fn(() => true) };

describe('CliSessionsController', () => {
  let controller: CliSessionsController;
  let service: jest.Mocked<CliSessionsService>;
  let archiveService: jest.Mocked<CliSessionArchiveService>;
  let archiveScheduler: jest.Mocked<CliSessionArchiveSchedulerService>;

  const mockSessionSummary = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    agentId: '550e8400-e29b-41d4-a716-446655440002',
    agentType: CliSessionAgentType.DEV,
    storyKey: '8-5',
    status: CliSessionStatus.COMPLETED,
    startedAt: '2026-02-01T10:00:00.000Z',
    endedAt: '2026-02-01T10:30:00.000Z',
    durationSeconds: 1800,
    lineCount: 100,
    isArchived: false,
    archivedAt: null,
  };

  const mockReplaySession = {
    ...mockSessionSummary,
    outputLines: ['Line 1', 'Line 2', 'Line 3'],
  };

  beforeEach(async () => {
    const mockService = {
      getWorkspaceSessions: jest.fn(),
      getSessionForReplay: jest.fn(),
      deleteSession: jest.fn(),
      createSession: jest.fn(),
      getSession: jest.fn(),
    };

    const mockArchiveService = {
      getArchiveStats: jest.fn(),
    };

    const mockArchiveScheduler = {
      enqueueSessionArchive: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CliSessionsController],
      providers: [
        {
          provide: CliSessionsService,
          useValue: mockService,
        },
        {
          provide: CliSessionArchiveService,
          useValue: mockArchiveService,
        },
        {
          provide: CliSessionArchiveSchedulerService,
          useValue: mockArchiveScheduler,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(WorkspaceAccessGuard)
      .useValue(mockGuard)
      .overrideGuard(WorkspaceAdminGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<CliSessionsController>(CliSessionsController);
    service = module.get(CliSessionsService);
    archiveService = module.get(CliSessionArchiveService);
    archiveScheduler = module.get(CliSessionArchiveSchedulerService);
  });

  describe('getSessions', () => {
    it('should return paginated sessions', async () => {
      const mockResult = {
        data: [mockSessionSummary],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      service.getWorkspaceSessions.mockResolvedValue(mockResult);

      const result = await controller.getSessions(
        '550e8400-e29b-41d4-a716-446655440003',
        { limit: 20, offset: 0 },
      );

      expect(result).toEqual(mockResult);
      expect(service.getWorkspaceSessions).toHaveBeenCalledWith({
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        agentType: undefined,
        status: undefined,
        storyKey: undefined,
        startDate: undefined,
        endDate: undefined,
        limit: 20,
        offset: 0,
      });
    });

    it('should pass filters to service', async () => {
      const mockResult = {
        data: [],
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false,
      };

      service.getWorkspaceSessions.mockResolvedValue(mockResult);

      await controller.getSessions(
        '550e8400-e29b-41d4-a716-446655440003',
        {
          limit: 10,
          offset: 5,
          agentType: CliSessionAgentType.QA,
          status: CliSessionStatus.FAILED,
          storyKey: '8-5',
          startDate: '2026-02-01',
          endDate: '2026-02-28',
        },
      );

      expect(service.getWorkspaceSessions).toHaveBeenCalledWith({
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        agentType: CliSessionAgentType.QA,
        status: CliSessionStatus.FAILED,
        storyKey: '8-5',
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        limit: 10,
        offset: 5,
      });
    });
  });

  describe('getArchiveStats', () => {
    it('should return archive statistics for workspace', async () => {
      archiveService.getArchiveStats.mockResolvedValue({
        totalArchived: 10,
        totalSizeBytes: 5242880,
        oldestArchive: new Date('2026-01-15T10:00:00Z'),
        newestArchive: new Date('2026-02-01T10:00:00Z'),
      });

      const result = await controller.getArchiveStats(
        '550e8400-e29b-41d4-a716-446655440003',
      );

      expect(result.totalArchived).toBe(10);
      expect(result.totalSizeBytes).toBe(5242880);
      expect(result.oldestArchive).toBe('2026-01-15T10:00:00.000Z');
      expect(result.newestArchive).toBe('2026-02-01T10:00:00.000Z');
    });

    it('should return zeros when no sessions are archived', async () => {
      archiveService.getArchiveStats.mockResolvedValue({
        totalArchived: 0,
        totalSizeBytes: 0,
        oldestArchive: null,
        newestArchive: null,
      });

      const result = await controller.getArchiveStats(
        '550e8400-e29b-41d4-a716-446655440003',
      );

      expect(result.totalArchived).toBe(0);
      expect(result.oldestArchive).toBeNull();
      expect(result.newestArchive).toBeNull();
    });
  });

  describe('getSession', () => {
    it('should return session with replay data', async () => {
      service.getSessionForReplay.mockResolvedValue(mockReplaySession);

      const result = await controller.getSession(
        '550e8400-e29b-41d4-a716-446655440003',
        '550e8400-e29b-41d4-a716-446655440001',
      );

      expect(result).toEqual(mockReplaySession);
      expect(service.getSessionForReplay).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440003',
        '550e8400-e29b-41d4-a716-446655440001',
      );
    });

    it('should throw NotFoundException when session not found', async () => {
      service.getSessionForReplay.mockRejectedValue(
        new NotFoundException('CLI session not found'),
      );

      await expect(
        controller.getSession(
          '550e8400-e29b-41d4-a716-446655440003',
          '550e8400-e29b-41d4-a716-446655440099',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('archiveSession', () => {
    it('should enqueue session for archival and return 202 Accepted message', async () => {
      service.getSession.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        storageKey: null,
      } as any);
      archiveScheduler.enqueueSessionArchive.mockResolvedValue(undefined);

      const result = await controller.archiveSession(
        '550e8400-e29b-41d4-a716-446655440003',
        '550e8400-e29b-41d4-a716-446655440001',
      );

      expect(result.message).toBe('Session queued for archival');
      expect(archiveScheduler.enqueueSessionArchive).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440001',
      );
    });

    it('should throw NotFoundException when session does not exist', async () => {
      service.getSession.mockResolvedValue(null);

      await expect(
        controller.archiveSession(
          '550e8400-e29b-41d4-a716-446655440003',
          '550e8400-e29b-41d4-a716-446655440099',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when session is already archived', async () => {
      service.getSession.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        storageKey: 'some/key.gz',
      } as any);

      await expect(
        controller.archiveSession(
          '550e8400-e29b-41d4-a716-446655440003',
          '550e8400-e29b-41d4-a716-446655440001',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteSession', () => {
    it('should delete session successfully', async () => {
      service.deleteSession.mockResolvedValue(undefined);

      await controller.deleteSession(
        '550e8400-e29b-41d4-a716-446655440003',
        '550e8400-e29b-41d4-a716-446655440001',
      );

      expect(service.deleteSession).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440003',
        '550e8400-e29b-41d4-a716-446655440001',
      );
    });

    it('should throw NotFoundException when session not found', async () => {
      service.deleteSession.mockRejectedValue(
        new NotFoundException('CLI session not found'),
      );

      await expect(
        controller.deleteSession(
          '550e8400-e29b-41d4-a716-446655440003',
          '550e8400-e29b-41d4-a716-446655440099',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

describe('CliSessionsInternalController', () => {
  let controller: CliSessionsInternalController;
  let service: jest.Mocked<CliSessionsService>;
  let archiveScheduler: jest.Mocked<CliSessionArchiveSchedulerService>;

  beforeEach(async () => {
    const mockService = {
      createSession: jest.fn(),
    };

    const mockArchiveScheduler = {
      enqueueSessionArchive: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CliSessionsInternalController],
      providers: [
        {
          provide: CliSessionsService,
          useValue: mockService,
        },
        {
          provide: CliSessionArchiveSchedulerService,
          useValue: mockArchiveScheduler,
        },
      ],
    })
      .overrideGuard(ServiceAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<CliSessionsInternalController>(CliSessionsInternalController);
    service = module.get(CliSessionsService);
    archiveScheduler = module.get(CliSessionArchiveSchedulerService);
  });

  describe('createSession', () => {
    it('should create session and return id', async () => {
      const dto = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        agentId: '550e8400-e29b-41d4-a716-446655440002',
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        agentType: CliSessionAgentType.DEV,
        outputText: 'test output',
        status: CliSessionStatus.COMPLETED,
        startedAt: '2026-02-01T10:00:00Z',
      };

      service.createSession.mockResolvedValue({
        id: dto.id,
      } as any);

      const result = await controller.createSession(dto);

      expect(result).toEqual({ id: dto.id });
      expect(service.createSession).toHaveBeenCalledWith(dto);
    });
  });

  describe('archiveSession (internal)', () => {
    it('should enqueue session for archival', async () => {
      archiveScheduler.enqueueSessionArchive.mockResolvedValue(undefined);

      const result = await controller.archiveSession(
        '550e8400-e29b-41d4-a716-446655440001',
      );

      expect(result.message).toBe('Session queued for archival');
      expect(archiveScheduler.enqueueSessionArchive).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440001',
      );
    });
  });
});
