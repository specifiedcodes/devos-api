import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AnalyticsEventsService } from '../services/analytics-events.service';
import { AnalyticsEvent } from '../entities/analytics-event.entity';

describe('AnalyticsEventsService', () => {
  let service: AnalyticsEventsService;
  let repository: Repository<AnalyticsEvent>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsEventsService,
        {
          provide: getRepositoryToken(AnalyticsEvent),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AnalyticsEventsService>(AnalyticsEventsService);
    repository = module.get<Repository<AnalyticsEvent>>(
      getRepositoryToken(AnalyticsEvent),
    );

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logEvent', () => {
    it('should log event successfully and return event ID', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      const eventType = 'onboarding_started';
      const eventData = { test: 'data' };
      const sessionId = 'session-123';

      const mockEvent = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        eventType,
        eventData,
        sessionId,
        timestamp: new Date(),
        createdAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(null); // No duplicate
      mockRepository.create.mockReturnValue(mockEvent);
      mockRepository.save.mockResolvedValue(mockEvent);

      const result = await service.logEvent(userId, workspaceId, eventType, eventData, sessionId);

      expect(result).toBe(mockEvent.id);
      expect(mockRepository.create).toHaveBeenCalledWith({
        userId,
        workspaceId,
        eventType,
        eventData,
        sessionId,
        timestamp: expect.any(Date),
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockEvent);
    });

    it('should return null for duplicate event within 1 second', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      const eventType = 'onboarding_started';
      const eventData = { test: 'data' };

      const existingEvent = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        eventType,
        eventData,
        timestamp: new Date(),
        createdAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(existingEvent); // Duplicate found

      const result = await service.logEvent(userId, workspaceId, eventType, eventData);

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should return null on error without throwing', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      const eventType = 'onboarding_started';
      const eventData = { test: 'data' };

      mockRepository.findOne.mockRejectedValue(new Error('Database error'));

      const result = await service.logEvent(userId, workspaceId, eventType, eventData);

      expect(result).toBeNull();
    });
  });

  describe('getEventsByUser', () => {
    it('should retrieve events for a user', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';

      const mockEvents = [
        {
          id: '1',
          userId,
          workspaceId: 'workspace-1',
          eventType: 'onboarding_started',
          eventData: {},
          timestamp: new Date('2026-01-01'),
          createdAt: new Date(),
        },
        {
          id: '2',
          userId,
          workspaceId: 'workspace-1',
          eventType: 'onboarding_completed',
          eventData: {},
          timestamp: new Date('2026-01-02'),
          createdAt: new Date(),
        },
      ];

      mockRepository.find.mockResolvedValue(mockEvents);

      const result = await service.getEventsByUser(userId);

      expect(result).toEqual(mockEvents);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { timestamp: 'ASC' },
      });
    });
  });

  describe('getEventsByType', () => {
    it('should retrieve events by type in date range', async () => {
      const eventType = 'onboarding_started';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.getEventsByType(eventType, startDate, endDate);

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('event');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('event.eventType = :eventType', {
        eventType,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'event.timestamp >= :startDate',
        { startDate },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'event.timestamp <= :endDate',
        { endDate },
      );
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();
    });

    it('should filter by workspace if provided', async () => {
      const eventType = 'onboarding_started';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');
      const workspaceId = 'workspace-123';

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.getEventsByType(eventType, startDate, endDate, workspaceId);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'event.workspaceId = :workspaceId',
        { workspaceId },
      );
    });
  });

  describe('deduplicateEvent', () => {
    it('should detect duplicate event within 1 second', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const eventType = 'onboarding_started';
      const timestamp = new Date();

      const existingEvent = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        eventType,
        timestamp: new Date(timestamp.getTime() - 500), // 0.5 seconds earlier
      };

      mockRepository.findOne.mockResolvedValue(existingEvent);

      const result = await service['deduplicateEvent'](userId, eventType, timestamp);

      expect(result).toBe(true);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          userId,
          eventType,
          timestamp: expect.any(Object), // Between query
        },
      });
    });

    it('should not detect duplicate if event is more than 1 second apart', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const eventType = 'onboarding_started';
      const timestamp = new Date();

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service['deduplicateEvent'](userId, eventType, timestamp);

      expect(result).toBe(false);
    });
  });
});
