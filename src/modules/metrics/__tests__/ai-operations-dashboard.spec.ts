import * as fs from 'fs';
import * as path from 'path';

describe('AI Operations Dashboard', () => {
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const dashboardPath = path.join(
    projectRoot,
    'grafana/dashboards/ai-operations.json',
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

  it('should have correct title "DevOS - AI Operations"', () => {
    expect(dashboard.title).toBe('DevOS - AI Operations');
  });

  it('should have correct uid "devos-ai-ops"', () => {
    expect(dashboard.uid).toBe('devos-ai-ops');
  });

  describe('panels', () => {
    let allPanels: any[];

    beforeAll(() => {
      allPanels = dashboard.panels.filter(
        (p: any) => p.type !== 'row',
      );
    });

    it('should contain panels for AI API cost rate', () => {
      const costPanel = allPanels.find(
        (p: any) =>
          p.title && p.title.includes('Cost') &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_ai_api_cost_usd_total'),
          ),
      );
      expect(costPanel).toBeDefined();
    });

    it('should contain panels for cost by model (pie chart)', () => {
      const piePanel = allPanels.find(
        (p: any) =>
          p.type === 'piechart' &&
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_ai_api_cost_usd_total'),
          ),
      );
      expect(piePanel).toBeDefined();
    });

    it('should contain panels for spend cap events', () => {
      const spendCapPanel = allPanels.find(
        (p: any) =>
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_spend_cap_events_total'),
          ),
      );
      expect(spendCapPanel).toBeDefined();
    });

    it('should contain panels for deployment operations', () => {
      const deployPanel = allPanels.find(
        (p: any) =>
          p.targets?.some((t: any) =>
            t.expr?.includes('devos_deployments_total'),
          ),
      );
      expect(deployPanel).toBeDefined();
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
