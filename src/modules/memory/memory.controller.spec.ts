/**
 * MemoryController Unit Tests
 * Story 12.1: Graphiti/Neo4j Setup
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MemoryController } from './memory.controller';
import { MemoryHealthService } from './services/memory-health.service';
import { MemoryHealth } from './interfaces/memory.interfaces';

describe('MemoryController', () => {
  let controller: MemoryController;
  let mockMemoryHealthService: Partial<MemoryHealthService>;

  const healthyResponse: MemoryHealth = {
    neo4jConnected: true,
    neo4jVersion: '5.15.0',
    totalEpisodes: 42,
    totalEntities: 15,
    lastEpisodeTimestamp: new Date('2026-01-15T10:00:00.000Z'),
    overallStatus: 'healthy',
  };

  const unavailableResponse: MemoryHealth = {
    neo4jConnected: false,
    neo4jVersion: null,
    totalEpisodes: 0,
    totalEntities: 0,
    lastEpisodeTimestamp: null,
    overallStatus: 'unavailable',
  };

  beforeEach(async () => {
    mockMemoryHealthService = {
      getHealth: jest.fn().mockResolvedValue(healthyResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MemoryController],
      providers: [
        {
          provide: MemoryHealthService,
          useValue: mockMemoryHealthService,
        },
      ],
    }).compile();

    controller = module.get<MemoryController>(MemoryController);
  });

  describe('GET /api/v1/memory/health', () => {
    it('should return 200 with health data when Neo4j is connected', async () => {
      const result = await controller.getHealth();

      expect(result).toEqual(healthyResponse);
      expect(result.neo4jConnected).toBe(true);
      expect(result.overallStatus).toBe('healthy');
      expect(mockMemoryHealthService.getHealth).toHaveBeenCalled();
    });

    it('should return health data with unavailable status when Neo4j is disconnected', async () => {
      (mockMemoryHealthService.getHealth as jest.Mock).mockResolvedValue(
        unavailableResponse,
      );

      const result = await controller.getHealth();

      expect(result).toEqual(unavailableResponse);
      expect(result.neo4jConnected).toBe(false);
      expect(result.overallStatus).toBe('unavailable');
    });

    it('should have JwtAuthGuard applied', () => {
      // Verify the guard is applied by checking controller metadata
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.getHealth,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });
  });
});
