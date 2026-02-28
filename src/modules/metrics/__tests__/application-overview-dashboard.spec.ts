import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../../../../..');
const dashboardPath = path.join(
  projectRoot,
  'grafana/dashboards/application-overview.json',
);
const shouldRun = fs.existsSync(dashboardPath);

(shouldRun ? describe : describe.skip)('Application Overview Dashboard', () => {
  let dashboard: any;

  beforeAll(() => {
    const content = fs.readFileSync(dashboardPath, 'utf-8');
    dashboard = JSON.parse(content);
  });

  it('should be valid JSON', () => {
    expect(dashboard).toBeDefined();
    expect(typeof dashboard).toBe('object');
  });

  it('should have correct title "DevOS - Application Overview"', () => {
    expect(dashboard.title).toBe('DevOS - Application Overview');
  });

  it('should have correct uid "devos-app-overview"', () => {
    expect(dashboard.uid).toBe('devos-app-overview');
  });

  it('should have valid time range defaults (last 1 hour)', () => {
    expect(dashboard.time).toBeDefined();
    expect(dashboard.time.from).toBe('now-1h');
    expect(dashboard.time.to).toBe('now');
  });

  it('should have auto-refresh interval (30s)', () => {
    expect(dashboard.refresh).toBe('30s');
  });

  it('should have browser timezone', () => {
    expect(dashboard.timezone).toBe('browser');
  });

  describe('panels', () => {
    let allPanels: any[];

    beforeAll(() => {
      allPanels = dashboard.panels.filter(
        (p: any) => p.type !== 'row',
      );
    });

    it('should contain panels for HTTP request rate', () => {
      const requestRatePanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Request Rate') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_http_requests_total'),
          ),
      );
      expect(requestRatePanel).toBeDefined();
    });

    it('should contain panels for response time percentiles (p50, p95, p99)', () => {
      const percentilePanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Response Time') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('histogram_quantile'),
          ),
      );
      expect(percentilePanel).toBeDefined();
      // Should have p50, p95, p99
      const exprs = percentilePanel.targets.map((t: any) => t.expr);
      expect(exprs.some((e: string) => e.includes('0.50') || e.includes('0.5'))).toBe(true);
      expect(exprs.some((e: string) => e.includes('0.95'))).toBe(true);
      expect(exprs.some((e: string) => e.includes('0.99'))).toBe(true);
    });

    it('should contain panels for error rates (4xx, 5xx)', () => {
      const errorPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Error Rate') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('status_code'),
          ),
      );
      expect(errorPanel).toBeDefined();
    });

    it('should contain panels for health status and uptime', () => {
      const healthPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Health') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_health_check_status'),
          ),
      );
      expect(healthPanel).toBeDefined();

      const uptimePanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Uptime') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_uptime_seconds'),
          ),
      );
      expect(uptimePanel).toBeDefined();
    });

    it('should contain panels for authentication metrics', () => {
      const authPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Auth') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_auth_attempts_total'),
          ),
      );
      expect(authPanel).toBeDefined();
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
