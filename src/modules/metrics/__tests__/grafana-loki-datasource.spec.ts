import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const projectRoot = path.resolve(__dirname, '../../../../..');
const datasourcesPath = path.join(
  projectRoot,
  'grafana/provisioning/datasources/datasources.yml',
);
const shouldRun = fs.existsSync(datasourcesPath);

(shouldRun ? describe : describe.skip)('Grafana Loki Datasource', () => {
  let lokiDS: any;
  let parsed: any;

  beforeAll(() => {
    const content = fs.readFileSync(datasourcesPath, 'utf-8');
    parsed = yaml.load(content);
    lokiDS = parsed.datasources.find((ds: any) => ds.name === 'Loki');
  });

  it('should contain Loki datasource in datasources.yml', () => {
    expect(lokiDS).toBeDefined();
    expect(lokiDS.type).toBe('loki');
  });

  it('should have correct Loki URL (http://loki:3100)', () => {
    expect(lokiDS.url).toBe('http://loki:3100');
  });

  it('should have uid set to "loki"', () => {
    expect(lokiDS.uid).toBe('loki');
  });

  it('should not be set as default (Prometheus is default)', () => {
    expect(lokiDS.isDefault).toBe(false);

    const promDS = parsed.datasources.find(
      (ds: any) => ds.name === 'Prometheus',
    );
    expect(promDS).toBeDefined();
    expect(promDS.isDefault).toBe(true);
  });

  it('should have access set to proxy', () => {
    expect(lokiDS.access).toBe('proxy');
  });

  it('should not be editable', () => {
    expect(lokiDS.editable).toBe(false);
  });

  it('should have maxLines configured in jsonData', () => {
    expect(lokiDS.jsonData).toBeDefined();
    expect(lokiDS.jsonData.maxLines).toBe(1000);
  });
});
