import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageTrackingService } from './usage-tracking.service';
import { UsageRecord } from '../../../database/entities/usage-record.entity';

describe('UsageTrackingService', () => {
  let service: UsageTrackingService;
  let repository: Repository<UsageRecord>;

  const mockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageTrackingService,
        {
          provide: getRepositoryToken(UsageRecord),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsageTrackingService>(UsageTrackingService);
    repository = module.get<Repository<UsageRecord>>(
      getRepositoryToken(UsageRecord),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackUsage', () => {
    it('should create new usage record if none exists', async () => {
      const data = {
        workspaceId: 'workspace-123',
        projectId: 'project-123',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        inputTokens: 1000,
        outputTokens: 500,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockResolvedValue({ id: 'record-123' });

      await service.trackUsage(data);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: data.workspaceId,
          projectId: data.projectId,
          provider: data.provider,
          model: data.model,
          requestCount: 1,
        }),
      );
    });

    it('should update existing record if one exists', async () => {
      const data = {
        workspaceId: 'workspace-123',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        inputTokens: 1000,
        outputTokens: 500,
      };

      const existingRecord = {
        id: 'record-123',
        requestCount: 5,
        inputTokens: '5000',
        outputTokens: '2500',
        costUSD: 0.1,
      };

      mockRepository.findOne.mockResolvedValue(existingRecord);

      await service.trackUsage(data);

      expect(mockRepository.update).toHaveBeenCalledWith(
        'record-123',
        expect.objectContaining({
          requestCount: 6,
        }),
      );
    });
  });

  describe('getWorkspaceUsage', () => {
    it('should aggregate usage data correctly', async () => {
      const workspaceId = 'workspace-123';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockRecords = [
        {
          id: '1',
          workspaceId,
          projectId: 'project-1',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          requestCount: 10,
          inputTokens: '10000',
          outputTokens: '5000',
          costUSD: 0.12,
          date: new Date('2026-01-15'),
        },
        {
          id: '2',
          workspaceId,
          projectId: 'project-2',
          provider: 'openai',
          model: 'gpt-4-turbo',
          requestCount: 5,
          inputTokens: '5000',
          outputTokens: '2500',
          costUSD: 0.08,
          date: new Date('2026-01-20'),
        },
      ];

      mockRepository.find.mockResolvedValue(mockRecords);

      const result = await service.getWorkspaceUsage(
        workspaceId,
        startDate,
        endDate,
      );

      expect(result.totalRequests).toBe(15);
      expect(result.totalInputTokens).toBe(15000);
      expect(result.totalOutputTokens).toBe(7500);
      expect(result.totalCostUSD).toBeCloseTo(0.2, 2);
      expect(Object.keys(result.breakdown.byProject)).toHaveLength(2);
    });
  });

  describe('exportUsage', () => {
    it('should generate CSV from usage records', async () => {
      const workspaceId = 'workspace-123';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockRecords = [
        {
          id: '1',
          date: new Date('2026-01-15'),
          projectId: 'project-1',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          requestCount: 10,
          inputTokens: '10000',
          outputTokens: '5000',
          costUSD: 0.12,
        },
      ];

      mockRepository.find.mockResolvedValue(mockRecords);

      const csv = await service.exportUsage(workspaceId, startDate, endDate);

      expect(csv).toContain('Date,Project ID,Provider,Model');
      expect(csv).toContain('2026-01-15');
      expect(csv).toContain('anthropic');
      expect(csv).toContain('0.1200');
    });
  });
});
