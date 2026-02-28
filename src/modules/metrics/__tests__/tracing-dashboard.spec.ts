import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../../../../..');
const dashboardPath = path.join(
  projectRoot,
  'grafana/dashboards/tracing-overview.json',
);
const shouldRun = fs.existsSync(dashboardPath);

(shouldRun ? describe : describe.skip)('Tracing Overview Dashboard', () => {
  let dashboard: any;

  beforeAll(() => {
    const content = fs.readFileSync(dashboardPath, 'utf-8');
    dashboard = JSON.parse(content);
  });

  it('should be valid JSON', () => {
    expect(dashboard).toBeDefined();
    expect(typeof dashboard).toBe('object');
  });

  it('should have correct title "DevOS - Distributed Tracing"', () => {
    expect(dashboard.title).toBe('DevOS - Distributed Tracing');
  });

  it('should have uid "devos-tracing"', () => {
    expect(dashboard.uid).toBe('devos-tracing');
  });

  it('should have auto-refresh set to 30s', () => {
    expect(dashboard.refresh).toBe('30s');
  });

  it('should have default time range of last 1 hour', () => {
    expect(dashboard.time).toBeDefined();
    expect(dashboard.time.from).toBe('now-1h');
    expect(dashboard.time.to).toBe('now');
  });

  it('should contain trace rate panel', () => {
    const panels = dashboard.panels.filter((p: any) => p.type !== 'row');
    const traceRatePanel = panels.find(
      (p: any) =>
        p.title && p.title.includes('Trace Rate'),
    );
    expect(traceRatePanel).toBeDefined();
    expect(traceRatePanel.type).toBe('timeseries');
  });

  it('should contain trace search panel referencing Jaeger datasource', () => {
    const panels = dashboard.panels.filter((p: any) => p.type !== 'row');
    const searchPanel = panels.find(
      (p: any) =>
        p.title && p.title.includes('Trace Search'),
    );
    expect(searchPanel).toBeDefined();
    expect(searchPanel.datasource.uid).toBe('jaeger');
  });

  it('should contain slow traces panel', () => {
    const panels = dashboard.panels.filter((p: any) => p.type !== 'row');
    const slowPanel = panels.find(
      (p: any) =>
        p.title && p.title.includes('Slow Traces'),
    );
    expect(slowPanel).toBeDefined();
    expect(slowPanel.type).toBe('table');
  });

  it('should contain correlated error logs panel referencing Loki datasource', () => {
    const panels = dashboard.panels.filter((p: any) => p.type !== 'row');
    const logsPanel = panels.find(
      (p: any) =>
        p.title && p.title.includes('Error Logs'),
    );
    expect(logsPanel).toBeDefined();
    expect(logsPanel.datasource.uid).toBe('loki');
    expect(logsPanel.type).toBe('logs');
  });

  it('should contain average trace duration panel', () => {
    const panels = dashboard.panels.filter((p: any) => p.type !== 'row');
    const durationPanel = panels.find(
      (p: any) =>
        p.title && p.title.includes('Average Trace Duration'),
    );
    expect(durationPanel).toBeDefined();
    expect(durationPanel.type).toBe('stat');
  });

  it('should contain error traces panel', () => {
    const panels = dashboard.panels.filter((p: any) => p.type !== 'row');
    const errorPanel = panels.find(
      (p: any) =>
        p.title && p.title === 'Error Traces',
    );
    expect(errorPanel).toBeDefined();
    expect(errorPanel.type).toBe('stat');
  });

  it('should contain request duration by route panel', () => {
    const panels = dashboard.panels.filter((p: any) => p.type !== 'row');
    const routePanel = panels.find(
      (p: any) =>
        p.title && p.title.includes('Request Duration by Route'),
    );
    expect(routePanel).toBeDefined();
    expect(routePanel.type).toBe('bargauge');
  });

  it('should have devos and tracing tags', () => {
    expect(dashboard.tags).toContain('devos');
    expect(dashboard.tags).toContain('tracing');
  });
});
