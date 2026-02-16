import { HealthController } from '../health.controller';
import { IncidentQueryService } from '../incident-query.service';

describe('HealthController - Public Status Endpoints (Story 14.9)', () => {
  let controller: HealthController;
  let mockHealthCheckService: any;
  let mockHealthHistoryService: any;
  let mockIncidentQueryService: any;

  const mockActiveIncidents = [
    {
      id: 'incident-1',
      title: 'Database Outage',
      severity: 'critical',
      status: 'investigating',
      affectedServices: ['database', 'api'],
      createdAt: new Date('2026-02-16T10:00:00Z'),
      updates: [],
    },
    {
      id: 'incident-2',
      title: 'Slow API',
      severity: 'minor',
      status: 'monitoring',
      affectedServices: ['api'],
      createdAt: new Date('2026-02-16T11:00:00Z'),
      updates: [],
    },
  ];

  const mockResolvedIncidents = [
    {
      id: 'incident-3',
      title: 'Redis Timeout',
      severity: 'major',
      status: 'resolved',
      affectedServices: ['redis'],
      createdAt: new Date('2026-02-15T10:00:00Z'),
      resolvedAt: new Date('2026-02-16T06:00:00Z'),
      updates: [],
    },
  ];

  beforeEach(() => {
    mockHealthCheckService = {
      checkHealth: jest.fn().mockResolvedValue({
        status: 'healthy',
        services: {
          database: { status: 'healthy' },
          redis: { status: 'healthy' },
          bullmq: { status: 'healthy' },
          neo4j: { status: 'healthy' },
        },
      }),
      checkReadiness: jest.fn(),
      checkDependency: jest.fn(),
    };

    mockHealthHistoryService = {
      getHistory: jest.fn(),
      getUptimePercentage: jest.fn(),
      getIncidents: jest.fn(),
    };

    mockIncidentQueryService = {
      getActiveIncidents: jest.fn().mockResolvedValue([]),
      getRecentlyResolvedIncidents: jest.fn().mockResolvedValue([]),
      derivePlatformStatus: jest.fn().mockReturnValue('operational'),
    };

    controller = new HealthController(
      mockHealthCheckService,
      mockHealthHistoryService,
      mockIncidentQueryService,
    );
  });

  describe('GET /health/incidents', () => {
    it('should return active incidents without auth', async () => {
      mockIncidentQueryService.getActiveIncidents.mockResolvedValue(mockActiveIncidents);
      mockIncidentQueryService.derivePlatformStatus.mockReturnValue('major_outage');

      const result = await controller.getPublicIncidents();

      expect(result.activeIncidents).toBeDefined();
      expect(result.status).toBeDefined();
      expect(mockIncidentQueryService.getActiveIncidents).toHaveBeenCalled();
    });

    it('should return empty array when no active incidents', async () => {
      mockIncidentQueryService.getActiveIncidents.mockResolvedValue([]);
      mockIncidentQueryService.derivePlatformStatus.mockReturnValue('operational');

      const result = await controller.getPublicIncidents();

      expect(result.activeIncidents).toEqual([]);
      expect(result.status).toBe('operational');
    });

    it('should order by severity (critical first) via service', async () => {
      // The service already sorts by severity
      const sortedIncidents = [
        { ...mockActiveIncidents[0], severity: 'critical' },
        { ...mockActiveIncidents[1], severity: 'minor' },
      ];
      mockIncidentQueryService.getActiveIncidents.mockResolvedValue(sortedIncidents);
      mockIncidentQueryService.derivePlatformStatus.mockReturnValue('major_outage');

      const result = await controller.getPublicIncidents();

      expect(result.activeIncidents[0].severity).toBe('critical');
      expect(result.activeIncidents[1].severity).toBe('minor');
    });

    it('should return major_outage for critical incidents', async () => {
      mockIncidentQueryService.getActiveIncidents.mockResolvedValue([mockActiveIncidents[0]]);
      mockIncidentQueryService.derivePlatformStatus.mockReturnValue('major_outage');

      const result = await controller.getPublicIncidents();

      expect(result.status).toBe('major_outage');
    });

    it('should return degraded_performance for minor incidents only', async () => {
      mockIncidentQueryService.getActiveIncidents.mockResolvedValue([
        { ...mockActiveIncidents[1], severity: 'minor' },
      ]);
      mockIncidentQueryService.derivePlatformStatus.mockReturnValue('degraded_performance');

      const result = await controller.getPublicIncidents();

      expect(result.status).toBe('degraded_performance');
    });
  });

  describe('GET /health/status', () => {
    it('should return operational when no incidents', async () => {
      const result = await controller.getPublicStatus();

      expect(result.status).toBe('operational');
      expect(result.activeIncidents).toEqual([]);
      expect(result.services).toBeDefined();
      expect(result.lastUpdated).toBeDefined();
    });

    it('should return degraded_performance for minor incidents', async () => {
      mockIncidentQueryService.getActiveIncidents.mockResolvedValue([
        { ...mockActiveIncidents[1], severity: 'minor' },
      ]);
      mockIncidentQueryService.derivePlatformStatus.mockReturnValue('degraded_performance');

      const result = await controller.getPublicStatus();

      expect(result.status).toBe('degraded_performance');
    });

    it('should return partial_outage for major incidents', async () => {
      mockIncidentQueryService.getActiveIncidents.mockResolvedValue([
        { ...mockActiveIncidents[0], severity: 'major' },
      ]);
      mockIncidentQueryService.derivePlatformStatus.mockReturnValue('partial_outage');

      const result = await controller.getPublicStatus();

      expect(result.status).toBe('partial_outage');
    });

    it('should return major_outage for critical incidents', async () => {
      mockIncidentQueryService.getActiveIncidents.mockResolvedValue([
        { ...mockActiveIncidents[0], severity: 'critical' },
      ]);
      mockIncidentQueryService.derivePlatformStatus.mockReturnValue('major_outage');

      const result = await controller.getPublicStatus();

      expect(result.status).toBe('major_outage');
    });

    it('should include recently resolved incidents (last 24h)', async () => {
      mockIncidentQueryService.getRecentlyResolvedIncidents.mockResolvedValue(mockResolvedIncidents);

      const result = await controller.getPublicStatus();

      expect(result.recentlyResolved).toBeDefined();
      expect(result.recentlyResolved).toEqual(mockResolvedIncidents);
    });

    it('should include services status', async () => {
      const result = await controller.getPublicStatus();

      expect(result.services).toBeDefined();
      expect(Object.keys(result.services)).toEqual(
        expect.arrayContaining(['api', 'websocket', 'database', 'redis', 'orchestrator']),
      );
    });

    it('should mark affected services from active incidents', async () => {
      mockIncidentQueryService.getActiveIncidents.mockResolvedValue([
        {
          ...mockActiveIncidents[0],
          severity: 'critical',
          affectedServices: ['database'],
        },
      ]);
      mockIncidentQueryService.derivePlatformStatus.mockReturnValue('major_outage');

      const result = await controller.getPublicStatus();

      expect(result.services.database).toBe('major_outage');
    });

    it('should map orchestrator service to bullmq health check', async () => {
      mockHealthCheckService.checkHealth.mockResolvedValue({
        status: 'degraded',
        services: {
          database: { status: 'healthy' },
          redis: { status: 'healthy' },
          bullmq: { status: 'unhealthy' },
          neo4j: { status: 'healthy' },
        },
      });

      const result = await controller.getPublicStatus();

      expect(result.services.orchestrator).toBe('major_outage');
    });
  });
});
