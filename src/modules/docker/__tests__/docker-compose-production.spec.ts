import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const COMPOSE_FILE = path.join(DEVOS_ROOT, 'docker-compose.production.yml');

describe('Production Docker Compose Validation', () => {
  let rawContent: string;
  let compose: any;

  beforeAll(() => {
    rawContent = fs.readFileSync(COMPOSE_FILE, 'utf-8');
    compose = yaml.load(rawContent) as any;
  });

  it('should parse docker-compose.production.yml as valid YAML', () => {
    expect(compose).toBeDefined();
    expect(compose.services).toBeDefined();
  });

  it('should define all 13 required services', () => {
    const requiredServices = [
      'devos-frontend',
      'devos-api',
      'devos-websocket',
      'devos-orchestrator',
      'postgres',
      'redis',
      'neo4j',
      'migrations',
      'prometheus',
      'grafana',
      'loki',
      'promtail',
      'jaeger',
    ];
    const serviceKeys = Object.keys(compose.services);
    for (const service of requiredServices) {
      expect(serviceKeys).toContain(service);
    }
  });

  it('should use production build targets for application services', () => {
    expect(compose.services['devos-frontend'].build.target).toBe('production');
    expect(compose.services['devos-api'].build.target).toBe('production');
    expect(compose.services['devos-websocket'].build.target).toBe('production');
    expect(compose.services['devos-orchestrator'].build.target).toBe(
      'production',
    );
  });

  it('should configure restart policies correctly', () => {
    const alwaysRestartServices = [
      'devos-frontend',
      'devos-api',
      'devos-websocket',
      'devos-orchestrator',
      'postgres',
      'redis',
      'neo4j',
      'prometheus',
      'grafana',
      'loki',
      'promtail',
      'jaeger',
    ];
    for (const service of alwaysRestartServices) {
      expect(compose.services[service].restart).toBe('always');
    }
    expect(compose.services.migrations.restart).toBe('no');
  });

  it('should define health checks for critical services', () => {
    const healthCheckServices = [
      'devos-api',
      'devos-frontend',
      'devos-websocket',
      'postgres',
      'redis',
      'neo4j',
      'grafana',
      'loki',
      'jaeger',
    ];
    for (const service of healthCheckServices) {
      expect(compose.services[service].healthcheck).toBeDefined();
      expect(compose.services[service].healthcheck.test).toBeDefined();
    }
  });

  it('should define resource limits for all services', () => {
    const servicesWithLimits = [
      'devos-frontend',
      'devos-api',
      'devos-websocket',
      'devos-orchestrator',
      'postgres',
      'redis',
      'neo4j',
      'prometheus',
      'grafana',
      'loki',
      'promtail',
      'jaeger',
    ];
    for (const service of servicesWithLimits) {
      const svc = compose.services[service];
      expect(svc.deploy).toBeDefined();
      expect(svc.deploy.resources).toBeDefined();
      expect(svc.deploy.resources.limits).toBeDefined();
      expect(svc.deploy.resources.limits.memory).toBeDefined();
      expect(svc.deploy.resources.limits.cpus).toBeDefined();
    }
  });

  it('should define all required named volumes', () => {
    const requiredVolumes = [
      'postgres_data',
      'redis_data',
      'neo4j_data',
      'cli_workspaces',
      'prometheus_data',
      'grafana_data',
      'loki_data',
    ];
    const volumeKeys = Object.keys(compose.volumes);
    for (const vol of requiredVolumes) {
      expect(volumeKeys).toContain(vol);
    }
  });

  it('should define custom network', () => {
    expect(compose.networks).toBeDefined();
    expect(compose.networks['devos-network']).toBeDefined();

    // All services should be attached to devos-network
    for (const [name, service] of Object.entries(compose.services) as [
      string,
      any,
    ][]) {
      expect(service.networks).toBeDefined();
      expect(service.networks).toContain('devos-network');
    }
  });

  it('should not hardcode any secrets', () => {
    // Check raw content for hardcoded passwords
    // Password/secret values should use ${VAR} syntax, not literal values
    const lines = rawContent.split('\n');
    for (const line of lines) {
      // Skip comments
      if (line.trim().startsWith('#')) continue;

      // Check for common password patterns that are NOT variable references
      if (
        line.match(
          /password\s*[:=]\s*[a-zA-Z0-9_]+/i,
        ) &&
        !line.includes('${') &&
        !line.includes('--requirepass') &&
        !line.includes('POSTGRES_PASSWORD') &&
        !line.includes('REDIS_PASSWORD') &&
        !line.includes('NEO4J_PASSWORD') &&
        !line.includes('GRAFANA_PASSWORD') &&
        !line.includes('SMTP_PASSWORD') &&
        !line.includes('JWT_SECRET') &&
        !line.includes('SESSION_SECRET') &&
        !line.includes('ENCRYPTION_KEY') &&
        !line.includes('DATABASE_PASSWORD')
      ) {
        fail(`Found potential hardcoded password in line: ${line.trim()}`);
      }
    }

    // Verify sensitive env vars use ${VAR} syntax
    expect(rawContent).toContain('${POSTGRES_PASSWORD}');
    expect(rawContent).toContain('${REDIS_PASSWORD}');
    expect(rawContent).toContain('${JWT_SECRET}');
  });

  it('should configure dependency ordering correctly', () => {
    const apiDeps = Object.keys(
      compose.services['devos-api'].depends_on || {},
    );
    expect(apiDeps).toContain('postgres');
    expect(apiDeps).toContain('redis');
    expect(apiDeps).toContain('neo4j');
    expect(apiDeps).toContain('migrations');

    const frontendDeps = Object.keys(
      compose.services['devos-frontend'].depends_on || {},
    );
    expect(frontendDeps).toContain('devos-api');
    expect(frontendDeps).toContain('devos-websocket');

    const wsDeps = Object.keys(
      compose.services['devos-websocket'].depends_on || {},
    );
    expect(wsDeps).toContain('redis');

    const orchDeps = Object.keys(
      compose.services['devos-orchestrator'].depends_on || {},
    );
    expect(orchDeps).toContain('redis');
    expect(orchDeps).toContain('devos-api');
    expect(orchDeps).toContain('devos-websocket');
    expect(orchDeps).toContain('neo4j');

    const migrationDeps = Object.keys(
      compose.services.migrations.depends_on || {},
    );
    expect(migrationDeps).toContain('postgres');

    const grafanaDeps = Object.keys(
      compose.services.grafana.depends_on || {},
    );
    expect(grafanaDeps).toContain('prometheus');
    expect(grafanaDeps).toContain('loki');
    expect(grafanaDeps).toContain('jaeger');

    const promtailDeps = Object.keys(
      compose.services.promtail.depends_on || {},
    );
    expect(promtailDeps).toContain('loki');
  });

  it('should use service_healthy condition for dependency health checks', () => {
    // API dependencies
    expect(
      compose.services['devos-api'].depends_on.postgres.condition,
    ).toBe('service_healthy');
    expect(compose.services['devos-api'].depends_on.redis.condition).toBe(
      'service_healthy',
    );
    expect(compose.services['devos-api'].depends_on.neo4j.condition).toBe(
      'service_healthy',
    );
    expect(
      compose.services['devos-api'].depends_on.migrations.condition,
    ).toBe('service_completed_successfully');

    // Frontend dependencies
    expect(
      compose.services['devos-frontend'].depends_on['devos-api'].condition,
    ).toBe('service_healthy');
    expect(
      compose.services['devos-frontend'].depends_on['devos-websocket']
        .condition,
    ).toBe('service_healthy');

    // WebSocket dependencies
    expect(
      compose.services['devos-websocket'].depends_on.redis.condition,
    ).toBe('service_healthy');
  });

  it('should mount config volumes as read-only', () => {
    // Check prometheus config mount
    const promVolumes = compose.services.prometheus.volumes || [];
    const promConfigMount = promVolumes.find((v: string) =>
      v.includes('prometheus.yml'),
    );
    expect(promConfigMount).toBeDefined();
    expect(promConfigMount).toMatch(/:ro$/);

    // Check loki config mount
    const lokiVolumes = compose.services.loki.volumes || [];
    const lokiConfigMount = lokiVolumes.find((v: string) =>
      v.includes('loki-config.yml'),
    );
    expect(lokiConfigMount).toBeDefined();
    expect(lokiConfigMount).toMatch(/:ro$/);

    // Check promtail config mount
    const promtailVolumes = compose.services.promtail.volumes || [];
    const promtailConfigMount = promtailVolumes.find((v: string) =>
      v.includes('promtail-config.yml'),
    );
    expect(promtailConfigMount).toBeDefined();
    expect(promtailConfigMount).toMatch(/:ro$/);

    // Check grafana provisioning mounts
    const grafanaVolumes = compose.services.grafana.volumes || [];
    const grafanaProvisioningMount = grafanaVolumes.find((v: string) =>
      v.includes('provisioning'),
    );
    expect(grafanaProvisioningMount).toBeDefined();
    expect(grafanaProvisioningMount).toMatch(/:ro$/);

    const grafanaDashboardsMount = grafanaVolumes.find((v: string) =>
      v.includes('/dashboards:'),
    );
    expect(grafanaDashboardsMount).toBeDefined();
    expect(grafanaDashboardsMount).toMatch(/:ro$/);
  });
});
