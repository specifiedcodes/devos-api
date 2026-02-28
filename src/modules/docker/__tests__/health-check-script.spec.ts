import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const HEALTH_CHECK_PATH = path.join(DEVOS_ROOT, 'scripts', 'health-check.sh');
const BUILD_PRODUCTION_PATH = path.join(DEVOS_ROOT, 'scripts', 'build-production.sh');
const shouldRun = fs.existsSync(HEALTH_CHECK_PATH);

(shouldRun ? describe : describe.skip)('Health Check Script Validation', () => {
  it('should verify health-check.sh exists and has correct shebang', () => {
    const scriptPath = path.join(DEVOS_ROOT, 'scripts', 'health-check.sh');
    expect(fs.existsSync(scriptPath)).toBe(true);

    const content = fs.readFileSync(scriptPath, 'utf-8');
    const firstLine = content.split('\n')[0];
    expect(firstLine).toBe('#!/usr/bin/env bash');
  });

  it('should verify health-check.sh uses strict mode', () => {
    const content = fs.readFileSync(
      path.join(DEVOS_ROOT, 'scripts', 'health-check.sh'),
      'utf-8',
    );
    expect(content).toContain('set -euo pipefail');
  });

  it('should verify health-check.sh checks all critical services', () => {
    const content = fs.readFileSync(
      path.join(DEVOS_ROOT, 'scripts', 'health-check.sh'),
      'utf-8',
    );
    const criticalServices = [
      'postgres',
      'redis',
      'neo4j',
      'devos-api',
      'devos-frontend',
      'devos-websocket',
      'grafana',
    ];
    for (const service of criticalServices) {
      expect(content).toContain(service);
    }
  });

  it('should verify build-production.sh exists and has correct shebang', () => {
    const scriptPath = path.join(
      DEVOS_ROOT,
      'scripts',
      'build-production.sh',
    );
    expect(fs.existsSync(scriptPath)).toBe(true);

    const content = fs.readFileSync(scriptPath, 'utf-8');
    const firstLine = content.split('\n')[0];
    expect(firstLine).toBe('#!/usr/bin/env bash');
  });

  it('should verify build-production.sh uses strict mode', () => {
    const content = fs.readFileSync(
      path.join(DEVOS_ROOT, 'scripts', 'build-production.sh'),
      'utf-8',
    );
    expect(content).toContain('set -euo pipefail');
  });
});
