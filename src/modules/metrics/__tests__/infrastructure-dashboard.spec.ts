import * as fs from 'fs';
import * as path from 'path';

describe('Infrastructure Dashboard', () => {
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const dashboardPath = path.join(
    projectRoot,
    'grafana/dashboards/infrastructure.json',
  );
  let dashboard: any;

  beforeAll(() => {
    const content = fs.readFileSync(dashboardPath, 'utf-8');
    dashboard = JSON.parse(content);
  });

  it('should be valid JSON', () => {
    expect(dashboard).toBeDefined();
    expect(typeof dashboard).toBe('object');
  });

  it('should have correct title "DevOS - Infrastructure"', () => {
    expect(dashboard.title).toBe('DevOS - Infrastructure');
  });

  it('should have correct uid "devos-infra"', () => {
    expect(dashboard.uid).toBe('devos-infra');
  });

  describe('panels', () => {
    let allPanels: any[];

    beforeAll(() => {
      allPanels = dashboard.panels.filter(
        (p: any) => p.type !== 'row',
      );
    });

    it('should contain panels for database connection pool', () => {
      const dbPoolPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('DB Connection Pool') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_database_pool'),
          ),
      );
      expect(dbPoolPanel).toBeDefined();
    });

    it('should contain panels for pool utilization gauge', () => {
      const poolUtilPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Pool Utilization') &&
          p.type === 'gauge',
      );
      expect(poolUtilPanel).toBeDefined();
    });

    it('should contain panels for Redis connection status', () => {
      const redisPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Redis Connection') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_redis_connected'),
          ),
      );
      expect(redisPanel).toBeDefined();
    });

    it('should contain panels for Redis memory and operations', () => {
      const redisMemoryPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Redis Memory') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_redis_memory_used_bytes'),
          ),
      );
      expect(redisMemoryPanel).toBeDefined();

      const redisOpsPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Redis Operations') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_redis_commands_processed_total'),
          ),
      );
      expect(redisOpsPanel).toBeDefined();
    });

    it('should contain panels for BullMQ queue sizes', () => {
      const bullmqPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Queue Size') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_bullmq_queue_size'),
          ),
      );
      expect(bullmqPanel).toBeDefined();
    });

    it('should contain panels for Node.js runtime metrics (CPU, memory, event loop)', () => {
      const cpuPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('CPU') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_process_cpu_user_seconds_total'),
          ),
      );
      expect(cpuPanel).toBeDefined();

      const memoryPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Memory') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_nodejs_heap_size'),
          ),
      );
      expect(memoryPanel).toBeDefined();

      const eventLoopPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Event Loop') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_nodejs_eventloop_lag_seconds'),
          ),
      );
      expect(eventLoopPanel).toBeDefined();
    });

    it('should have all panels reference Prometheus datasource', () => {
      for (const panel of allPanels) {
        if (panel.targets && panel.targets.length > 0) {
          expect(panel.datasource).toBeDefined();
          expect(panel.datasource.type).toBe('prometheus');
        }
      }
    });
  });
});
