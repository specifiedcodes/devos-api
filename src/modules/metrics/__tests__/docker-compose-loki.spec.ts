import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Docker Compose Loki Configuration', () => {
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const composePath = path.join(projectRoot, 'docker-compose.yml');
  let compose: any;

  beforeAll(() => {
    const content = fs.readFileSync(composePath, 'utf-8');
    compose = yaml.load(content);
  });

  it('should contain loki service definition', () => {
    expect(compose.services).toBeDefined();
    expect(compose.services.loki).toBeDefined();
  });

  it('should use correct Loki image (grafana/loki:3.0.0)', () => {
    expect(compose.services.loki.image).toBe('grafana/loki:3.0.0');
  });

  it('should map Loki port 3100:3100', () => {
    const ports = compose.services.loki.ports;
    expect(ports).toBeDefined();
    expect(ports).toContainEqual('3100:3100');
  });

  it('should have Loki health check configured', () => {
    const healthcheck = compose.services.loki.healthcheck;
    expect(healthcheck).toBeDefined();
    expect(healthcheck.test).toBeDefined();
    // Verify health check targets /ready endpoint
    const testStr = Array.isArray(healthcheck.test)
      ? healthcheck.test.join(' ')
      : healthcheck.test;
    expect(testStr).toContain('3100/ready');
  });

  it('should contain promtail service definition', () => {
    expect(compose.services.promtail).toBeDefined();
  });

  it('should have Promtail depend on loki', () => {
    const dependsOn = compose.services.promtail.depends_on;
    expect(dependsOn).toBeDefined();
    expect(dependsOn.loki).toBeDefined();
    expect(dependsOn.loki.condition).toBe('service_healthy');
  });

  it('should have Promtail mount docker socket', () => {
    const volumes = compose.services.promtail.volumes;
    expect(volumes).toBeDefined();
    expect(
      volumes.some((v: string) => v.includes('/var/run/docker.sock')),
    ).toBe(true);
  });

  it('should have loki_data volume declared', () => {
    expect(compose.volumes).toBeDefined();
    expect(compose.volumes).toHaveProperty('loki_data');
  });

  it('should have Loki container name set to devos-loki', () => {
    expect(compose.services.loki.container_name).toBe('devos-loki');
  });

  it('should have Promtail container name set to devos-promtail', () => {
    expect(compose.services.promtail.container_name).toBe('devos-promtail');
  });

  it('should have Promtail use correct image (grafana/promtail:3.0.0)', () => {
    expect(compose.services.promtail.image).toBe('grafana/promtail:3.0.0');
  });

  it('should have Grafana depend on loki', () => {
    const dependsOn = compose.services.grafana.depends_on;
    expect(dependsOn).toBeDefined();
    expect(dependsOn.loki).toBeDefined();
  });
});
