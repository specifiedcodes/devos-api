import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { HealthCheckService } from '../health.service';
import { HealthHistoryService } from '../health-history.service';
import { IncidentQueryService } from '../incident-query.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotFoundException } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthCheckService: jest.Mocked<Partial<HealthCheckService>>;
  let mockHealthHistoryService: jest.Mocked<Partial<HealthHistoryService>>;

  const mockHealthCheckResult = {
    status: 'healthy' as const,
    timestamp: '2026-02-16T10:00:00.000Z',
    uptime: 86400,
    version: '0.1.0',
    services: {
      database: {
        status: 'healthy' as const,
        responseTimeMs: 12,
        lastChecked: '2026-02-16T10:00:00.000Z',
      },
      redis: {
        status: 'healthy' as const,
        responseTimeMs: 3,
        lastChecked: '2026-02-16T10:00:00.000Z',
      },
      bullmq: {
        status: 'healthy' as const,
        responseTimeMs: 8,
        lastChecked: '2026-02-16T10:00:00.000Z',
      },
      neo4j: {
        status: 'healthy' as const,
        responseTimeMs: 45,
        lastChecked: '2026-02-16T10:00:00.000Z',
      },
    },
    summary: { total: 4, healthy: 4, degraded: 0, unhealthy: 0 },
  };

  beforeEach(async () => {
    mockHealthCheckService = {
      checkHealth: jest.fn().mockResolvedValue(mockHealthCheckResult),
      checkReadiness: jest.fn().mockResolvedValue({
        database: {
          status: 'healthy',
          responseTimeMs: 12,
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
        redis: {
          status: 'healthy',
          responseTimeMs: 3,
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
        bullmq: {
          status: 'healthy',
          responseTimeMs: 8,
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
      }),
      checkDependency: jest.fn().mockResolvedValue({
        status: 'healthy',
        responseTimeMs: 12,
        lastChecked: '2026-02-16T10:00:00.000Z',
      }),
    };

    mockHealthHistoryService = {
      getHistory: jest.fn().mockResolvedValue([]),
      getUptimePercentage: jest.fn().mockResolvedValue(100),
      getIncidents: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: HealthHistoryService, useValue: mockHealthHistoryService },
        {
          provide: IncidentQueryService,
          useValue: {
            getActiveIncidents: jest.fn().mockResolvedValue([]),
            getRecentlyResolvedIncidents: jest.fn().mockResolvedValue([]),
            derivePlatformStatus: jest.fn().mockReturnValue('operational'),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health (liveness)', () => {
    it('should return 200 with status ok and uptime', () => {
      const result = controller.getLiveness();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
    });

    it('should not check external dependencies (liveness is minimal)', () => {
      controller.getLiveness();

      expect(mockHealthCheckService.checkHealth).not.toHaveBeenCalled();
      expect(mockHealthCheckService.checkReadiness).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready (readiness)', () => {
    it('should return ready when all critical dependencies are healthy', async () => {
      const mockRes = { status: jest.fn() } as any;
      const result = await controller.getReadiness(mockRes);

      expect(result.status).toBe('ready');
      expect(result.checks).toBeDefined();
      expect(result.checks.database.status).toBe('healthy');
      expect(result.checks.redis.status).toBe('healthy');
      expect(result.checks.bullmq.status).toBe('healthy');
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 503 when database is unhealthy', async () => {
      mockHealthCheckService.checkReadiness = jest.fn().mockResolvedValue({
        database: {
          status: 'unhealthy',
          responseTimeMs: -1,
          error: 'Connection timeout',
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
        redis: {
          status: 'healthy',
          responseTimeMs: 3,
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
        bullmq: {
          status: 'healthy',
          responseTimeMs: 8,
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
      });

      const mockRes = { status: jest.fn() } as any;
      const result = await controller.getReadiness(mockRes);

      expect(result.status).toBe('not_ready');
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(result.checks.database.error).toBe('Connection timeout');
    });

    it('should return 503 when Redis is unhealthy', async () => {
      mockHealthCheckService.checkReadiness = jest.fn().mockResolvedValue({
        database: {
          status: 'healthy',
          responseTimeMs: 12,
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
        redis: {
          status: 'unhealthy',
          responseTimeMs: -1,
          error: 'ECONNREFUSED',
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
        bullmq: {
          status: 'healthy',
          responseTimeMs: 8,
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
      });

      const mockRes = { status: jest.fn() } as any;
      const result = await controller.getReadiness(mockRes);

      expect(result.status).toBe('not_ready');
      expect(mockRes.status).toHaveBeenCalledWith(503);
    });
  });

  describe('GET /health/detailed', () => {
    it('should return comprehensive health with all services', async () => {
      const result = await controller.getDetailed();

      expect(result.status).toBe('healthy');
      expect(result.services).toBeDefined();
      expect(result.services.database).toBeDefined();
      expect(result.services.redis).toBeDefined();
      expect(result.services.bullmq).toBeDefined();
      expect(result.services.neo4j).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should call checkHealth on the service', async () => {
      await controller.getDetailed();

      expect(mockHealthCheckService.checkHealth).toHaveBeenCalled();
    });
  });

  describe('GET /health/dependencies/:name', () => {
    it('should return specific dependency health for valid name', async () => {
      const result = await controller.getDependencyHealth('database');

      expect(result).toBeDefined();
      expect(result.status).toBe('healthy');
      expect(mockHealthCheckService.checkDependency).toHaveBeenCalledWith(
        'database',
      );
    });

    it('should return 404 for unknown dependency name', async () => {
      await expect(
        controller.getDependencyHealth('unknown'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should accept valid dependency names: database, redis, bullmq, neo4j', async () => {
      for (const name of ['database', 'redis', 'bullmq', 'neo4j']) {
        await expect(
          controller.getDependencyHealth(name),
        ).resolves.toBeDefined();
      }
    });
  });

  describe('Guard configuration', () => {
    it('should have JwtAuthGuard on detailed endpoint', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        HealthController.prototype.getDetailed,
      );
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });

    it('should have JwtAuthGuard on dependencies endpoint', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        HealthController.prototype.getDependencyHealth,
      );
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });
  });
});
