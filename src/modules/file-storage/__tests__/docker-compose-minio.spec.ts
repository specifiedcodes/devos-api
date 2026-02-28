/**
 * Docker Compose MinIO Configuration Tests
 * Story 16.1: MinIO S3 Storage Setup
 *
 * Validates that both development and production Docker Compose files
 * contain correctly configured MinIO services.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const projectRoot = path.resolve(__dirname, '../../../../..');
const devComposePath = path.join(projectRoot, 'docker-compose.yml');
const prodComposePath = path.join(projectRoot, 'docker-compose.production.yml');
const shouldRun = fs.existsSync(devComposePath) && fs.existsSync(prodComposePath);

(shouldRun ? describe : describe.skip)('Docker Compose MinIO Configuration', () => {
  let devCompose: any;
  let prodCompose: any;

  beforeAll(() => {
    const devContent = fs.readFileSync(devComposePath, 'utf8');
    devCompose = yaml.load(devContent) as any;

    const prodContent = fs.readFileSync(prodComposePath, 'utf8');
    prodCompose = yaml.load(prodContent) as any;
  });

  describe('Development docker-compose.yml', () => {
    it('should contain minio service', () => {
      expect(devCompose.services.minio).toBeDefined();
    });

    it('should use correct minio image', () => {
      expect(devCompose.services.minio.image).toMatch(/^minio\/minio/);
    });

    it('should expose correct ports', () => {
      const ports = devCompose.services.minio.ports;
      expect(ports).toBeDefined();
      expect(ports).toContain('9000:9000'); // S3 API
      expect(ports).toContain('9001:9001'); // Console
    });

    it('should have health check configured', () => {
      const healthcheck = devCompose.services.minio.healthcheck;
      expect(healthcheck).toBeDefined();
      expect(healthcheck.test).toBeDefined();
      // The test command should include 'mc ready local'
      const testCmd = Array.isArray(healthcheck.test)
        ? healthcheck.test.join(' ')
        : healthcheck.test;
      expect(testCmd).toContain('mc');
      expect(testCmd).toContain('ready');
      expect(testCmd).toContain('local');
    });

    it('should have data volume', () => {
      const volumes = devCompose.services.minio.volumes;
      expect(volumes).toBeDefined();
      expect(volumes.some((v: string) => v.includes('minio_data:/data'))).toBe(true);

      // Top-level volume should exist
      expect(devCompose.volumes.minio_data).toBeDefined();
    });

    it('should have api service depending on minio', () => {
      const apiDependsOn = devCompose.services.api.depends_on;
      expect(apiDependsOn.minio).toBeDefined();
      expect(apiDependsOn.minio.condition).toBe('service_healthy');
    });

    it('should have MinIO environment variables in api service', () => {
      const apiEnv = devCompose.services.api.environment;
      expect(apiEnv.MINIO_ENDPOINT).toBeDefined();
      expect(apiEnv.MINIO_PORT).toBeDefined();
      expect(apiEnv.MINIO_ACCESS_KEY).toBeDefined();
      expect(apiEnv.MINIO_SECRET_KEY).toBeDefined();
    });
  });

  describe('Production docker-compose.production.yml', () => {
    it('should contain minio service', () => {
      expect(prodCompose.services.minio).toBeDefined();
    });

    it('should have health check configured', () => {
      const healthcheck = prodCompose.services.minio.healthcheck;
      expect(healthcheck).toBeDefined();
    });

    it('should NOT expose ports to host', () => {
      const ports = prodCompose.services.minio.ports;
      expect(ports).toBeUndefined();
    });

    it('should have resource limits', () => {
      const limits = prodCompose.services.minio.deploy?.resources?.limits;
      expect(limits).toBeDefined();
      expect(limits.memory).toBeDefined();
      expect(limits.cpus).toBeDefined();
    });

    it('should be on devos-network', () => {
      const networks = prodCompose.services.minio.networks;
      expect(networks).toContain('devos-network');
    });

    it('should have minio_data volume', () => {
      expect(prodCompose.volumes.minio_data).toBeDefined();
    });

    it('should have devos-api depending on minio', () => {
      const apiDependsOn = prodCompose.services['devos-api'].depends_on;
      expect(apiDependsOn.minio).toBeDefined();
      expect(apiDependsOn.minio.condition).toBe('service_healthy');
    });

    it('should have restart policy', () => {
      expect(prodCompose.services.minio.restart).toBe('always');
    });
  });
});
