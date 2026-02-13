import { Test, TestingModule } from '@nestjs/testing';
import { CliSessionsController, CliSessionsInternalController } from '../cli-sessions.controller';
import { CliSessionsService } from '../cli-sessions.service';
import { CliSessionStatus, CliSessionAgentType } from '../../../database/entities/cli-session.entity';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { WorkspaceAdminGuard } from '../../workspaces/guards/workspace-admin.guard';
import { ServiceAuthGuard } from '../../../shared/guards/service-auth.guard';

// Mock guards
const mockGuard = { canActivate: jest.fn(() => true) };

describe('CliSessionsController', () => {
  let controller: CliSessionsController;
  let service: jest.Mocked<CliSessionsService>;

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
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CliSessionsController],
      providers: [
        {
          provide: CliSessionsService,
          useValue: mockService,
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

  beforeEach(async () => {
    const mockService = {
      createSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CliSessionsInternalController],
      providers: [
        {
          provide: CliSessionsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(ServiceAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<CliSessionsInternalController>(CliSessionsInternalController);
    service = module.get(CliSessionsService);
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
});
