import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../../../../..');
const dashboardPath = path.join(
  projectRoot,
  'grafana/dashboards/log-exploration.json',
);
const shouldRun = fs.existsSync(dashboardPath);

(shouldRun ? describe : describe.skip)('Log Exploration Dashboard', () => {
  let dashboard: any;
  let allPanels: any[];

  beforeAll(() => {
    const content = fs.readFileSync(dashboardPath, 'utf-8');
    dashboard = JSON.parse(content);
    allPanels = dashboard.panels.filter((p: any) => p.type !== 'row');
  });

  it('should be valid JSON', () => {
    expect(dashboard).toBeDefined();
    expect(typeof dashboard).toBe('object');
  });

  it('should have correct title "DevOS - Log Exploration"', () => {
    expect(dashboard.title).toBe('DevOS - Log Exploration');
  });

  it('should have uid "devos-logs"', () => {
    expect(dashboard.uid).toBe('devos-logs');
  });

  it('should have default time range of last 15 minutes', () => {
    expect(dashboard.time).toBeDefined();
    expect(dashboard.time.from).toBe('now-15m');
    expect(dashboard.time.to).toBe('now');
  });

  it('should have auto-refresh set to 10s', () => {
    expect(dashboard.refresh).toBe('10s');
  });

  it('should contain log volume panels with Loki queries', () => {
    const volumePanel = allPanels.find(
      (p: any) =>
        p.title === 'Log Volume by Service' &&
        p.targets?.some((t: any) =>
          t.expr?.includes('count_over_time'),
        ),
    );
    expect(volumePanel).toBeDefined();
    expect(volumePanel.type).toBe('timeseries');
  });

  it('should contain error log rate panel', () => {
    const errorPanel = allPanels.find(
      (p: any) =>
        p.title === 'Error Log Rate' &&
        p.targets?.some((t: any) =>
          t.expr?.includes('level="error"'),
        ),
    );
    expect(errorPanel).toBeDefined();
  });

  it('should contain log level distribution panel', () => {
    const distPanel = allPanels.find(
      (p: any) =>
        p.title === 'Log Level Distribution (1h)' &&
        p.type === 'piechart',
    );
    expect(distPanel).toBeDefined();
  });

  it('should contain live log stream panel', () => {
    const logPanel = allPanels.find(
      (p: any) =>
        p.title === 'All Service Logs' &&
        p.type === 'logs',
    );
    expect(logPanel).toBeDefined();
    expect(logPanel.gridPos.w).toBe(24); // Full width
  });

  it('should contain error log panel', () => {
    const errorLogPanel = allPanels.find(
      (p: any) =>
        p.title === 'Error Logs Only' &&
        p.type === 'logs',
    );
    expect(errorLogPanel).toBeDefined();
  });

  it('should contain slow request panel', () => {
    const slowPanel = allPanels.find(
      (p: any) =>
        p.title === 'Slow Requests (>1s)' &&
        p.targets?.some((t: any) =>
          t.expr?.includes('duration > 1000'),
        ),
    );
    expect(slowPanel).toBeDefined();
  });

  it('should contain failed requests panel', () => {
    const failedPanel = allPanels.find(
      (p: any) =>
        p.title === 'Failed Requests' &&
        p.targets?.some((t: any) =>
          t.expr?.includes('statusCode >= 400'),
        ),
    );
    expect(failedPanel).toBeDefined();
  });

  it('should have all log panels reference Loki datasource', () => {
    for (const panel of allPanels) {
      if (panel.targets && panel.targets.length > 0) {
        expect(panel.datasource).toBeDefined();
        expect(panel.datasource.type).toBe('loki');
        expect(panel.datasource.uid).toBe('loki');
      }
    }
  });

  it('should have 4 row panels', () => {
    const rows = dashboard.panels.filter((p: any) => p.type === 'row');
    expect(rows.length).toBe(4);
  });
});
