import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const projectRoot = path.resolve(__dirname, '../../../../..');
const lokiConfigPath = path.join(projectRoot, 'loki/loki-config.yml');
const promtailConfigPath = path.join(projectRoot, 'promtail/promtail-config.yml');
const shouldRun = fs.existsSync(lokiConfigPath) && fs.existsSync(promtailConfigPath);

(shouldRun ? describe : describe.skip)('Loki Configuration', () => {
  let lokiConfig: any;

  beforeAll(() => {
    const content = fs.readFileSync(lokiConfigPath, 'utf-8');
    lokiConfig = yaml.load(content);
  });

  it('should be valid YAML', () => {
    expect(lokiConfig).toBeDefined();
    expect(typeof lokiConfig).toBe('object');
  });

  it('should have auth_enabled set to false', () => {
    expect(lokiConfig.auth_enabled).toBe(false);
  });

  it('should have http_listen_port set to 3100', () => {
    expect(lokiConfig.server).toBeDefined();
    expect(lokiConfig.server.http_listen_port).toBe(3100);
  });

  it('should have retention_period configured (720h)', () => {
    expect(lokiConfig.limits_config).toBeDefined();
    expect(lokiConfig.limits_config.retention_period).toBe('720h');
  });

  it('should have compactor with retention_enabled true', () => {
    expect(lokiConfig.compactor).toBeDefined();
    expect(lokiConfig.compactor.retention_enabled).toBe(true);
  });
});

(shouldRun ? describe : describe.skip)('Promtail Configuration', () => {
  let promtailConfig: any;

  beforeAll(() => {
    const content = fs.readFileSync(promtailConfigPath, 'utf-8');
    promtailConfig = yaml.load(content);
  });

  it('should be valid YAML', () => {
    expect(promtailConfig).toBeDefined();
    expect(typeof promtailConfig).toBe('object');
  });

  it('should have correct Loki push URL (http://loki:3100/loki/api/v1/push)', () => {
    expect(promtailConfig.clients).toBeDefined();
    expect(Array.isArray(promtailConfig.clients)).toBe(true);
    expect(promtailConfig.clients[0].url).toBe(
      'http://loki:3100/loki/api/v1/push',
    );
  });

  it('should have docker_sd_configs for container discovery', () => {
    expect(promtailConfig.scrape_configs).toBeDefined();
    expect(Array.isArray(promtailConfig.scrape_configs)).toBe(true);

    const dockerJob = promtailConfig.scrape_configs.find(
      (sc: any) => sc.job_name === 'docker',
    );
    expect(dockerJob).toBeDefined();
    expect(dockerJob.docker_sd_configs).toBeDefined();
    expect(Array.isArray(dockerJob.docker_sd_configs)).toBe(true);
    expect(dockerJob.docker_sd_configs[0].host).toBe(
      'unix:///var/run/docker.sock',
    );
  });
});
