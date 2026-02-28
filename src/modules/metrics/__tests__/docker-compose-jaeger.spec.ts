import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const projectRoot = path.resolve(__dirname, '../../../../..');
const composePath = path.join(projectRoot, 'docker-compose.yml');
const shouldRun = fs.existsSync(composePath);

(shouldRun ? describe : describe.skip)('Docker Compose Jaeger Configuration', () => {
  let composeConfig: any;

  beforeAll(() => {
    const content = fs.readFileSync(composePath, 'utf-8');
    composeConfig = yaml.load(content);
  });

  describe('Jaeger Service', () => {
    it('should contain jaeger service definition', () => {
      expect(composeConfig.services.jaeger).toBeDefined();
    });

    it('should use correct image (jaegertracing/all-in-one:1.57)', () => {
      expect(composeConfig.services.jaeger.image).toBe(
        'jaegertracing/all-in-one:1.57',
      );
    });

    it('should map port 16686 for UI', () => {
      const ports = composeConfig.services.jaeger.ports;
      expect(ports).toBeDefined();
      const uiPort = ports.find(
        (p: string) => p.includes('16686'),
      );
      expect(uiPort).toBe('16686:16686');
    });

    it('should map port 4318 for OTLP HTTP', () => {
      const ports = composeConfig.services.jaeger.ports;
      expect(ports).toBeDefined();
      const otlpPort = ports.find(
        (p: string) => p.includes('4318'),
      );
      expect(otlpPort).toBe('4318:4318');
    });

    it('should have COLLECTOR_OTLP_ENABLED set to "true"', () => {
      expect(composeConfig.services.jaeger.environment.COLLECTOR_OTLP_ENABLED).toBe(
        'true',
      );
    });

    it('should have health check configured', () => {
      const healthcheck = composeConfig.services.jaeger.healthcheck;
      expect(healthcheck).toBeDefined();
      expect(healthcheck.test).toBeDefined();
      expect(healthcheck.interval).toBeDefined();
      expect(healthcheck.timeout).toBeDefined();
      expect(healthcheck.retries).toBeDefined();
    });
  });

  describe('API Service OTEL Configuration', () => {
    it('should have OTEL_ENABLED environment variable', () => {
      expect(composeConfig.services.api.environment.OTEL_ENABLED).toBe('true');
    });

    it('should have OTEL_SERVICE_NAME environment variable', () => {
      expect(composeConfig.services.api.environment.OTEL_SERVICE_NAME).toBe(
        'devos-api',
      );
    });

    it('should have OTEL_EXPORTER_OTLP_ENDPOINT pointing to jaeger', () => {
      expect(
        composeConfig.services.api.environment.OTEL_EXPORTER_OTLP_ENDPOINT,
      ).toBe('http://jaeger:4318');
    });

    it('should depend on jaeger', () => {
      const dependsOn = composeConfig.services.api.depends_on;
      expect(dependsOn).toBeDefined();
      expect(dependsOn.jaeger).toBeDefined();
      expect(dependsOn.jaeger.condition).toBe('service_healthy');
    });
  });
});
