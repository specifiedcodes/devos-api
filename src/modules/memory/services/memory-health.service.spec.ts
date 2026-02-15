/**
 * MemoryHealthService Unit Tests
 * Story 12.1: Graphiti/Neo4j Setup
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MemoryHealthService } from './memory-health.service';
import { Neo4jService } from './neo4j.service';

describe('MemoryHealthService', () => {
  let service: MemoryHealthService;
  let mockNeo4jService: Partial<Neo4jService>;

  const createMockResult = (records: Record<string, unknown>[] = []) => ({
    records: records.map((record) => ({
      get: jest.fn((key: string) => record[key]),
    })),
  });

  beforeEach(async () => {
    mockNeo4jService = {
      verifyConnectivity: jest.fn().mockResolvedValue(true),
      runQuery: jest.fn().mockResolvedValue(createMockResult()),
      isConnected: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryHealthService,
        { provide: Neo4jService, useValue: mockNeo4jService },
      ],
    }).compile();

    service = module.get<MemoryHealthService>(MemoryHealthService);
  });

  describe('getHealth', () => {
    it('should return healthy when Neo4j is connected', async () => {
      (mockNeo4jService.runQuery as jest.Mock)
        .mockResolvedValueOnce(createMockResult([{ version: '5.15.0' }])) // version
        .mockResolvedValueOnce(createMockResult([{ count: 10 }])) // episodes
        .mockResolvedValueOnce(createMockResult([{ count: 5 }])) // entities
        .mockResolvedValueOnce(
          createMockResult([{ ts: '2026-01-15T10:00:00.000Z' }]),
        ); // timestamp

      const health = await service.getHealth();

      expect(health.neo4jConnected).toBe(true);
      expect(health.neo4jVersion).toBe('5.15.0');
      expect(health.totalEpisodes).toBe(10);
      expect(health.totalEntities).toBe(5);
      expect(health.overallStatus).toBe('healthy');
    });

    it('should return unavailable when Neo4j is disconnected', async () => {
      (mockNeo4jService.verifyConnectivity as jest.Mock).mockResolvedValue(
        false,
      );

      const health = await service.getHealth();

      expect(health.neo4jConnected).toBe(false);
      expect(health.neo4jVersion).toBeNull();
      expect(health.totalEpisodes).toBe(0);
      expect(health.totalEntities).toBe(0);
      expect(health.overallStatus).toBe('unavailable');
    });

    it('should return correct episode and entity counts', async () => {
      (mockNeo4jService.runQuery as jest.Mock)
        .mockResolvedValueOnce(createMockResult([{ version: '5.15.0' }]))
        .mockResolvedValueOnce(createMockResult([{ count: 100 }])) // episodes
        .mockResolvedValueOnce(createMockResult([{ count: 50 }])) // entities
        .mockResolvedValueOnce(createMockResult([])); // no timestamp

      const health = await service.getHealth();

      expect(health.totalEpisodes).toBe(100);
      expect(health.totalEntities).toBe(50);
      expect(health.lastEpisodeTimestamp).toBeNull();
    });

    it('should handle errors during health check gracefully', async () => {
      (mockNeo4jService.verifyConnectivity as jest.Mock).mockResolvedValue(
        true,
      );
      (mockNeo4jService.runQuery as jest.Mock).mockRejectedValue(
        new Error('Query failed'),
      );

      const health = await service.getHealth();

      expect(health.neo4jConnected).toBe(false);
      expect(health.overallStatus).toBe('unavailable');
    });
  });

  describe('getGraphStats', () => {
    it('should return node and relationship counts', async () => {
      (mockNeo4jService.runQuery as jest.Mock)
        .mockResolvedValueOnce(createMockResult([{ count: 100 }])) // episodes
        .mockResolvedValueOnce(createMockResult([{ count: 50 }])) // entities
        .mockResolvedValueOnce(createMockResult([{ count: 200 }])); // relationships

      const stats = await service.getGraphStats();

      expect(stats.episodeCount).toBe(100);
      expect(stats.entityCount).toBe(50);
      expect(stats.relationshipCount).toBe(200);
      expect(stats.storageEstimateMB).toBeGreaterThan(0);
    });

    it('should handle Neo4j unavailable gracefully', async () => {
      (mockNeo4jService.verifyConnectivity as jest.Mock).mockResolvedValue(
        false,
      );

      const stats = await service.getGraphStats();

      expect(stats.episodeCount).toBe(0);
      expect(stats.entityCount).toBe(0);
      expect(stats.relationshipCount).toBe(0);
      expect(stats.storageEstimateMB).toBe(0);
    });

    it('should handle query errors gracefully', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockRejectedValue(
        new Error('Query failed'),
      );

      const stats = await service.getGraphStats();

      expect(stats.episodeCount).toBe(0);
      expect(stats.entityCount).toBe(0);
      expect(stats.relationshipCount).toBe(0);
      expect(stats.storageEstimateMB).toBe(0);
    });
  });
});
