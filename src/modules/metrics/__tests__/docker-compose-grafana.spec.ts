import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const projectRoot = path.resolve(__dirname, '../../../../..');
const composePath = path.join(projectRoot, 'docker-compose.yml');
const shouldRun = fs.existsSync(composePath);

(shouldRun ? describe : describe.skip)('Docker Compose Grafana Configuration', () => {
  let compose: any;

  beforeAll(() => {
    const content = fs.readFileSync(composePath, 'utf-8');
    compose = yaml.load(content);
  });

  it('should contain grafana service definition', () => {
    expect(compose.services).toBeDefined();
    expect(compose.services.grafana).toBeDefined();
  });

  it('should use correct image (grafana/grafana:11.0.0)', () => {
    expect(compose.services.grafana.image).toBe('grafana/grafana:11.0.0');
  });

  it('should have correct container name', () => {
    expect(compose.services.grafana.container_name).toBe('devos-grafana');
  });

  it('should map port 3003:3000', () => {
    const ports = compose.services.grafana.ports;
    expect(ports).toBeDefined();
    expect(ports).toContain('3003:3000');
  });

  it('should depend on prometheus', () => {
    const dependsOn = compose.services.grafana.depends_on;
    expect(dependsOn).toBeDefined();
    expect(dependsOn.prometheus).toBeDefined();
  });

  it('should mount provisioning volumes', () => {
    const volumes = compose.services.grafana.volumes;
    expect(volumes).toBeDefined();
    expect(
      volumes.some((v: string) =>
        v.includes('grafana/provisioning/dashboards'),
      ),
    ).toBe(true);
    expect(
      volumes.some((v: string) =>
        v.includes('grafana/provisioning/datasources'),
      ),
    ).toBe(true);
  });

  it('should mount dashboard volumes', () => {
    const volumes = compose.services.grafana.volumes;
    expect(
      volumes.some((v: string) =>
        v.includes('grafana/dashboards'),
      ),
    ).toBe(true);
  });

  it('should have grafana_data volume declared', () => {
    expect(compose.volumes).toBeDefined();
    expect(compose.volumes).toHaveProperty('grafana_data');
  });

  it('should have environment variables configured', () => {
    const env = compose.services.grafana.environment;
    expect(env).toBeDefined();
    expect(env.GF_SECURITY_ADMIN_USER).toBe('admin');
    expect(env.GF_USERS_ALLOW_SIGN_UP).toBe('false');
  });

  it('should have healthcheck configured', () => {
    const healthcheck = compose.services.grafana.healthcheck;
    expect(healthcheck).toBeDefined();
    expect(healthcheck.test).toBeDefined();
  });
});
