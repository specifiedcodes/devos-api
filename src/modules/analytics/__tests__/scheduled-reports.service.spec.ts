import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { ScheduledReportsService } from '../services/scheduled-reports.service';
import { ScheduledReport, ReportFrequency } from '../../../database/entities/scheduled-report.entity';

describe('ScheduledReportsService', () => {
  let service: ScheduledReportsService;
  let repository: Repository<ScheduledReport>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledReportsService,
        {
          provide: getRepositoryToken(ScheduledReport),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ScheduledReportsService>(ScheduledReportsService);
    repository = module.get<Repository<ScheduledReport>>(getRepositoryToken(ScheduledReport));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a scheduled report', async () => {
      const createDto = {
        name: 'Weekly Report',
        frequency: ReportFrequency.WEEKLY,
        sections: ['velocity', 'burndown'],
        recipients: ['user@example.com'],
        dayOfWeek: 1,
        timeUtc: '09:00',
      };

      const mockReport = {
        id: 'report-1',
        workspaceId: 'workspace-1',
        createdBy: 'user-1',
        ...createDto,
        filters: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(mockReport);
      mockRepository.save.mockResolvedValue(mockReport);

      const result = await service.create('workspace-1', 'user-1', createDto);

      expect(result.name).toBe('Weekly Report');
      expect(result.frequency).toBe(ReportFrequency.WEEKLY);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all scheduled reports for a workspace', async () => {
      const mockReports = [
        { id: 'report-1', workspaceId: 'workspace-1', name: 'Report 1' },
        { id: 'report-2', workspaceId: 'workspace-1', name: 'Report 2' },
      ];

      mockRepository.find.mockResolvedValue(mockReports);

      const result = await service.findAll('workspace-1');

      expect(result).toHaveLength(2);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: 'workspace-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a scheduled report', async () => {
      const mockReport = {
        id: 'report-1',
        workspaceId: 'workspace-1',
        name: 'Report 1',
      };

      mockRepository.findOne.mockResolvedValue(mockReport);

      const result = await service.findOne('workspace-1', 'report-1');

      expect(result.id).toBe('report-1');
    });

    it('should throw NotFoundException if report not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('workspace-1', 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a scheduled report', async () => {
      const mockReport = {
        id: 'report-1',
        workspaceId: 'workspace-1',
        name: 'Old Name',
        frequency: ReportFrequency.WEEKLY,
        sections: ['velocity'],
        recipients: ['user@example.com'],
        timeUtc: '09:00',
        filters: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockReport);
      mockRepository.save.mockResolvedValue({ ...mockReport, name: 'New Name' });

      const result = await service.update('workspace-1', 'report-1', {
        name: 'New Name',
      });

      expect(result.name).toBe('New Name');
    });

    it('should throw NotFoundException if report not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('workspace-1', 'non-existent', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a scheduled report', async () => {
      const mockReport = {
        id: 'report-1',
        workspaceId: 'workspace-1',
      };

      mockRepository.findOne.mockResolvedValue(mockReport);
      mockRepository.remove.mockResolvedValue(mockReport);

      await service.remove('workspace-1', 'report-1');

      expect(mockRepository.remove).toHaveBeenCalledWith(mockReport);
    });

    it('should throw NotFoundException if report not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('workspace-1', 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findDueReports', () => {
    it('should find daily reports due at current time', async () => {
      const now = new Date();
      const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

      const mockReports = [
        {
          id: 'report-1',
          frequency: ReportFrequency.DAILY,
          timeUtc: currentTime,
          isActive: true,
          lastSentAt: null,
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockReports),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findDueReports(ReportFrequency.DAILY);

      expect(result).toHaveLength(1);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('markAsSent', () => {
    it('should update lastSentAt timestamp with race condition prevention', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.markAsSent('report-1');

      expect(result).toBe(true);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should return false if report was already sent recently', async () => {
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.markAsSent('report-1');

      expect(result).toBe(false);
    });
  });
});
