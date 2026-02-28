import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const projectRoot = path.resolve(__dirname, '../../../../..');
const dsPath = path.join(
  projectRoot,
  'grafana/provisioning/datasources/datasources.yml',
);
const shouldRun = fs.existsSync(dsPath);

(shouldRun ? describe : describe.skip)('Grafana Jaeger Datasource Configuration', () => {
  let dsConfig: any;

  beforeAll(() => {
    const content = fs.readFileSync(dsPath, 'utf-8');
    dsConfig = yaml.load(content);
  });

  describe('Jaeger Datasource', () => {
    it('should contain Jaeger datasource', () => {
      const jaegerDs = dsConfig.datasources.find(
        (ds: any) => ds.name === 'Jaeger',
      );
      expect(jaegerDs).toBeDefined();
    });

    it('should have correct URL (http://jaeger:16686)', () => {
      const jaegerDs = dsConfig.datasources.find(
        (ds: any) => ds.name === 'Jaeger',
      );
      expect(jaegerDs.url).toBe('http://jaeger:16686');
    });

    it('should have uid "jaeger"', () => {
      const jaegerDs = dsConfig.datasources.find(
        (ds: any) => ds.name === 'Jaeger',
      );
      expect(jaegerDs.uid).toBe('jaeger');
    });

    it('should have type "jaeger"', () => {
      const jaegerDs = dsConfig.datasources.find(
        (ds: any) => ds.name === 'Jaeger',
      );
      expect(jaegerDs.type).toBe('jaeger');
    });

    it('should not be the default datasource', () => {
      const jaegerDs = dsConfig.datasources.find(
        (ds: any) => ds.name === 'Jaeger',
      );
      expect(jaegerDs.isDefault).toBe(false);
    });
  });

  describe('Loki derivedFields', () => {
    it('should link traceId to Jaeger datasource (uid=jaeger)', () => {
      const lokiDs = dsConfig.datasources.find(
        (ds: any) => ds.name === 'Loki',
      );
      expect(lokiDs).toBeDefined();
      expect(lokiDs.jsonData.derivedFields).toBeDefined();

      const traceIdField = lokiDs.jsonData.derivedFields.find(
        (f: any) => f.name === 'TraceID',
      );
      expect(traceIdField).toBeDefined();
      expect(traceIdField.datasourceUid).toBe('jaeger');
    });

    it('should have matcherRegex that extracts traceId correctly', () => {
      const lokiDs = dsConfig.datasources.find(
        (ds: any) => ds.name === 'Loki',
      );
      const traceIdField = lokiDs.jsonData.derivedFields.find(
        (f: any) => f.name === 'TraceID',
      );

      // Test the regex against a sample log line
      const regex = new RegExp(traceIdField.matcherRegex);
      const sampleLog = '{"level":"info","traceId":"abc123def456","message":"test"}';
      const match = sampleLog.match(regex);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('abc123def456');
    });

    it('should have URL template for trace ID click-through', () => {
      const lokiDs = dsConfig.datasources.find(
        (ds: any) => ds.name === 'Loki',
      );
      const traceIdField = lokiDs.jsonData.derivedFields.find(
        (f: any) => f.name === 'TraceID',
      );
      expect(traceIdField.url).toBeDefined();
      expect(traceIdField.url).toContain('__value.raw');
    });
  });
});
