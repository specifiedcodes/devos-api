import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../../../../..');
const dashboardPath = path.join(
  projectRoot,
  'grafana/dashboards/business-metrics.json',
);
const shouldRun = fs.existsSync(dashboardPath);

(shouldRun ? describe : describe.skip)('Business Metrics Dashboard', () => {
  let dashboard: any;

  beforeAll(() => {
    const content = fs.readFileSync(dashboardPath, 'utf-8');
    dashboard = JSON.parse(content);
  });

  it('should be valid JSON', () => {
    expect(dashboard).toBeDefined();
    expect(typeof dashboard).toBe('object');
  });

  it('should have correct title "DevOS - Business Metrics"', () => {
    expect(dashboard.title).toBe('DevOS - Business Metrics');
  });

  it('should have correct uid "devos-business"', () => {
    expect(dashboard.uid).toBe('devos-business');
  });

  describe('panels', () => {
    let allPanels: any[];

    beforeAll(() => {
      allPanels = dashboard.panels.filter(
        (p: any) => p.type !== 'row',
      );
    });

    it('should contain panels for active users', () => {
      const usersPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Active Users') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_active_users_total'),
          ),
      );
      expect(usersPanel).toBeDefined();
    });

    it('should contain panels for workspaces and projects', () => {
      const workspacesPanel = allPanels.find(
        (p: any) =>
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_workspaces_total'),
          ),
      );
      expect(workspacesPanel).toBeDefined();

      const projectsPanel = allPanels.find(
        (p: any) =>
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_projects_created_total'),
          ),
      );
      expect(projectsPanel).toBeDefined();
    });

    it('should contain panels for deployment rates by platform', () => {
      const deployPanel = allPanels.find(
        (p: any) =>
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_deployments_total'),
          ),
      );
      expect(deployPanel).toBeDefined();
    });

    it('should contain panels for AI spend', () => {
      const spendPanel = allPanels.find(
        (p: any) =>
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_ai_api_cost_usd_total'),
          ),
      );
      expect(spendPanel).toBeDefined();
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
