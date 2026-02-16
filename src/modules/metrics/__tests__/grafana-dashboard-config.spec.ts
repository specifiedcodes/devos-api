import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Grafana Dashboard Configuration', () => {
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const datasourcesPath = path.join(
    projectRoot,
    'grafana/provisioning/datasources/datasources.yml',
  );
  const dashboardsPath = path.join(
    projectRoot,
    'grafana/provisioning/dashboards/dashboards.yml',
  );

  describe('datasources.yml', () => {
    let content: string;
    let parsed: any;

    beforeAll(() => {
      content = fs.readFileSync(datasourcesPath, 'utf-8');
      parsed = yaml.load(content);
    });

    it('should be valid YAML with Prometheus datasource configured', () => {
      expect(parsed).toBeDefined();
      expect(parsed.apiVersion).toBe(1);
      expect(parsed.datasources).toBeDefined();
      expect(Array.isArray(parsed.datasources)).toBe(true);
      expect(parsed.datasources.length).toBeGreaterThan(0);
    });

    it('should have a Prometheus datasource', () => {
      const promDS = parsed.datasources.find(
        (ds: any) => ds.name === 'Prometheus',
      );
      expect(promDS).toBeDefined();
      expect(promDS.type).toBe('prometheus');
      expect(promDS.isDefault).toBe(true);
    });

    it('should point to correct Prometheus URL (http://prometheus:9090)', () => {
      const promDS = parsed.datasources.find(
        (ds: any) => ds.name === 'Prometheus',
      );
      expect(promDS.url).toBe('http://prometheus:9090');
    });

    it('should have access set to proxy', () => {
      const promDS = parsed.datasources.find(
        (ds: any) => ds.name === 'Prometheus',
      );
      expect(promDS.access).toBe('proxy');
    });

    it('should not be editable', () => {
      const promDS = parsed.datasources.find(
        (ds: any) => ds.name === 'Prometheus',
      );
      expect(promDS.editable).toBe(false);
    });

    it('should have explicit uid matching dashboard panel references', () => {
      const promDS = parsed.datasources.find(
        (ds: any) => ds.name === 'Prometheus',
      );
      expect(promDS.uid).toBe('prometheus');
    });

    it('should have timeInterval set to 15s', () => {
      const promDS = parsed.datasources.find(
        (ds: any) => ds.name === 'Prometheus',
      );
      expect(promDS.jsonData).toBeDefined();
      expect(promDS.jsonData.timeInterval).toBe('15s');
    });

    it('should use POST httpMethod', () => {
      const promDS = parsed.datasources.find(
        (ds: any) => ds.name === 'Prometheus',
      );
      expect(promDS.jsonData.httpMethod).toBe('POST');
    });
  });

  describe('dashboards.yml', () => {
    let content: string;
    let parsed: any;

    beforeAll(() => {
      content = fs.readFileSync(dashboardsPath, 'utf-8');
      parsed = yaml.load(content);
    });

    it('should be valid YAML with file provider configured', () => {
      expect(parsed).toBeDefined();
      expect(parsed.apiVersion).toBe(1);
      expect(parsed.providers).toBeDefined();
      expect(Array.isArray(parsed.providers)).toBe(true);
      expect(parsed.providers.length).toBeGreaterThan(0);
    });

    it('should have DevOS provider', () => {
      const provider = parsed.providers.find(
        (p: any) => p.name === 'DevOS',
      );
      expect(provider).toBeDefined();
      expect(provider.type).toBe('file');
    });

    it('should point to correct dashboard directory path', () => {
      const provider = parsed.providers.find(
        (p: any) => p.name === 'DevOS',
      );
      expect(provider.options).toBeDefined();
      expect(provider.options.path).toBe('/var/lib/grafana/dashboards');
    });

    it('should have correct orgId and folder', () => {
      const provider = parsed.providers.find(
        (p: any) => p.name === 'DevOS',
      );
      expect(provider.orgId).toBe(1);
      expect(provider.folder).toBe('DevOS');
    });

    it('should have update interval of 30 seconds', () => {
      const provider = parsed.providers.find(
        (p: any) => p.name === 'DevOS',
      );
      expect(provider.updateIntervalSeconds).toBe(30);
    });
  });
});
