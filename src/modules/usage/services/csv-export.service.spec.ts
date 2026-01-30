import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CsvExportService } from './csv-export.service';
import { ApiUsage } from '../../../database/entities/api-usage.entity';
import { Readable, PassThrough } from 'stream';

describe('CsvExportService', () => {
  let service: CsvExportService;
  let repository: Repository<ApiUsage>;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    stream: jest.fn(),
  };

  const mockRepository = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvExportService,
        {
          provide: getRepositoryToken(ApiUsage),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CsvExportService>(CsvExportService);
    repository = module.get<Repository<ApiUsage>>(getRepositoryToken(ApiUsage));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateCsvStream', () => {
    it('should generate CSV stream with correct headers', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const workspaceId = 'workspace-123';

      // Mock empty stream
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });

      mockQueryBuilder.stream.mockResolvedValue(mockStream);

      const result = await service.generateCsvStream(
        workspaceId,
        startDate,
        endDate,
      );

      expect(result).toBeInstanceOf(PassThrough);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('usage');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'usage.workspace_id = :workspaceId',
        { workspaceId },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'usage.created_at BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    });

    it('should format CSV rows correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const workspaceId = 'workspace-123';

      const mockData = [
        {
          id: 'usage-1',
          createdAt: new Date('2024-01-15T10:30:00Z'),
          provider: 'anthropic',
          model: 'claude-3-opus',
          projectName: 'Test Project',
          inputTokens: 1000,
          outputTokens: 500,
          costUsd: '0.015000',
          agentId: 'agent-1',
        },
      ];

      const mockStream = new Readable({
        objectMode: true,
        read() {
          mockData.forEach((item) => this.push(item));
          this.push(null);
        },
      });

      mockQueryBuilder.stream.mockResolvedValue(mockStream);

      const result = await service.generateCsvStream(
        workspaceId,
        startDate,
        endDate,
      );

      const chunks: Buffer[] = [];
      for await (const chunk of result) {
        chunks.push(Buffer.from(chunk));
      }

      const csvContent = Buffer.concat(chunks).toString();

      // Check headers
      expect(csvContent).toContain('Timestamp,Provider,Model,Project,Input Tokens,Output Tokens,Cost (USD),Agent ID');

      // Check data row
      expect(csvContent).toContain('2024-01-15T10:30:00.000Z');
      expect(csvContent).toContain('anthropic');
      expect(csvContent).toContain('claude-3-opus');
      expect(csvContent).toContain('Test Project');
      expect(csvContent).toContain('1000');
      expect(csvContent).toContain('500');
      expect(csvContent).toContain('0.015000');
      expect(csvContent).toContain('agent-1');
    });

    it('should handle null project names', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const workspaceId = 'workspace-123';

      const mockData = [
        {
          id: 'usage-1',
          createdAt: new Date('2024-01-15T10:30:00Z'),
          provider: 'openai',
          model: 'gpt-4',
          projectName: null,
          inputTokens: 2000,
          outputTokens: 1000,
          costUsd: '0.120000',
          agentId: null,
        },
      ];

      const mockStream = new Readable({
        objectMode: true,
        read() {
          mockData.forEach((item) => this.push(item));
          this.push(null);
        },
      });

      mockQueryBuilder.stream.mockResolvedValue(mockStream);

      const result = await service.generateCsvStream(
        workspaceId,
        startDate,
        endDate,
      );

      const chunks: Buffer[] = [];
      for await (const chunk of result) {
        chunks.push(Buffer.from(chunk));
      }

      const csvContent = Buffer.concat(chunks).toString();

      // Should show "No Project" for null project
      expect(csvContent).toContain('No Project');
      // Should show empty string for null agentId (last field on line)
      expect(csvContent).toContain(',0.120000,\n'); // Empty agent ID field at end
    });

    it('should handle large datasets with streaming', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const workspaceId = 'workspace-123';

      // Generate 1000 mock records
      const mockData = Array.from({ length: 1000 }, (_, i) => {
        const day = (i % 28) + 1;
        const paddedDay = day.toString().padStart(2, '0');
        return {
          id: `usage-${i}`,
          createdAt: new Date(`2024-01-${paddedDay}T10:30:00Z`),
          provider: i % 2 === 0 ? 'anthropic' : 'openai',
          model: i % 2 === 0 ? 'claude-3-opus' : 'gpt-4',
          projectName: `Project ${i % 10}`,
          inputTokens: 1000 + i,
          outputTokens: 500 + i,
          costUsd: (0.015 + i * 0.001).toFixed(6),
          agentId: `agent-${i % 5}`,
        };
      });

      const mockStream = new Readable({
        objectMode: true,
        read() {
          mockData.forEach((item) => this.push(item));
          this.push(null);
        },
      });

      mockQueryBuilder.stream.mockResolvedValue(mockStream);

      const result = await service.generateCsvStream(
        workspaceId,
        startDate,
        endDate,
      );

      const chunks: Buffer[] = [];
      for await (const chunk of result) {
        chunks.push(Buffer.from(chunk));
      }

      const csvContent = Buffer.concat(chunks).toString();
      const lines = csvContent.trim().split('\n');

      // Should have header + 1000 data rows
      expect(lines.length).toBe(1001);
    });

    it('should escape CSV special characters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const workspaceId = 'workspace-123';

      const mockData = [
        {
          id: 'usage-1',
          createdAt: new Date('2024-01-15T10:30:00Z'),
          provider: 'anthropic',
          model: 'claude-3-opus',
          projectName: 'Project "Test", with comma',
          inputTokens: 1000,
          outputTokens: 500,
          costUsd: '0.015000',
          agentId: 'agent-1',
        },
      ];

      const mockStream = new Readable({
        objectMode: true,
        read() {
          mockData.forEach((item) => this.push(item));
          this.push(null);
        },
      });

      mockQueryBuilder.stream.mockResolvedValue(mockStream);

      const result = await service.generateCsvStream(
        workspaceId,
        startDate,
        endDate,
      );

      const chunks: Buffer[] = [];
      for await (const chunk of result) {
        chunks.push(Buffer.from(chunk));
      }

      const csvContent = Buffer.concat(chunks).toString();

      // Project name should be quoted and quotes should be escaped
      expect(csvContent).toContain('"Project ""Test"", with comma"');
    });
  });

  describe('getEstimatedRowCount', () => {
    it('should return estimated row count', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const workspaceId = 'workspace-123';

      const mockCountQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(12345),
      };

      mockRepository.createQueryBuilder = jest.fn(() => mockCountQueryBuilder as any);

      const count = await service.getEstimatedRowCount(
        workspaceId,
        startDate,
        endDate,
      );

      expect(count).toBe(12345);
      expect(mockCountQueryBuilder.where).toHaveBeenCalledWith(
        'usage.workspace_id = :workspaceId',
        { workspaceId },
      );
    });
  });
});
