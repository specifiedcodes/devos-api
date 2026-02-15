import { Registry } from 'prom-client';
import { BusinessMetricsService } from '../services/business-metrics.service';
import { MetricsService } from '../metrics.service';
import { DataSource } from 'typeorm';

describe('BusinessMetricsService', () => {
  let service: BusinessMetricsService;
  let registry: Registry;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(() => {
    registry = new Registry();
    const metricsService = {
      getRegistry: () => registry,
    } as MetricsService;

    mockDataSource = {
      query: jest.fn(),
    } as any;

    service = new BusinessMetricsService(metricsService, mockDataSource);
  });

  afterEach(async () => {
    await registry.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('project events', () => {
    it('should increment projects_created_total on project.created event', async () => {
      service.handleProjectCreated();

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_projects_created_total');
    });
  });

  describe('cost events', () => {
    it('should increment ai_api_cost_usd_total with correct provider and model labels', async () => {
      service.handleCostUpdate({
        provider: 'anthropic',
        model: 'claude-3-opus',
        cost: 0.05,
      });

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_ai_api_cost_usd_total');
      expect(metricsText).toContain('provider="anthropic"');
      expect(metricsText).toContain('model="claude-3-opus"');
    });

    it('should handle cost events with missing fields gracefully', async () => {
      service.handleCostUpdate({ cost: 0.01 });

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('provider="unknown"');
      expect(metricsText).toContain('model="unknown"');
    });

    it('should not increment cost for zero or negative values', async () => {
      service.handleCostUpdate({ cost: 0 });
      service.handleCostUpdate({ cost: -1 });

      const metricsText = await registry.metrics();
      // Counter should not have been incremented
      expect(metricsText).not.toContain('devos_ai_api_cost_usd_total{');
    });
  });

  describe('deployment events', () => {
    it('should increment deployments_total with platform and result labels', async () => {
      service.handleDeploymentCompleted({
        platform: 'railway',
        result: 'success',
      });

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_deployments_total');
      expect(metricsText).toContain('platform="railway"');
      expect(metricsText).toContain('result="success"');
    });

    it('should handle deployment events with missing fields', async () => {
      service.handleDeploymentCompleted({});

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('platform="unknown"');
      expect(metricsText).toContain('result="success"');
    });
  });

  describe('spend cap events', () => {
    it('should increment spend_cap_events_total with correct event_type', async () => {
      service.handleSpendCapEvent({ event_type: 'warning' });

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_spend_cap_events_total');
      expect(metricsText).toContain('event_type="warning"');
    });
  });

  describe('periodic gauge updates', () => {
    it('should update active_users_total gauge periodically', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ count: '15' }]);
      mockDataSource.query.mockResolvedValueOnce([{ count: '5' }]);

      await service.updateGauges();

      const metrics = await registry.getMetricsAsJSON();
      const activeUsers = metrics.find(
        (m) => m.name === 'devos_active_users_total',
      );
      expect(activeUsers).toBeDefined();
    });

    it('should update workspaces_total gauge periodically', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ count: '10' }]);
      mockDataSource.query.mockResolvedValueOnce([{ count: '3' }]);

      await service.updateGauges();

      const metrics = await registry.getMetricsAsJSON();
      const workspaces = metrics.find(
        (m) => m.name === 'devos_workspaces_total',
      );
      expect(workspaces).toBeDefined();
    });

    it('should handle database query errors gracefully', async () => {
      mockDataSource.query.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(service.updateGauges()).resolves.not.toThrow();
    });
  });
});
