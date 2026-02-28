import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const SERVICES = [
  'devos-api',
  'devos-frontend',
  'devos-websocket',
  'devos-orchestrator',
];

const AVAILABLE_SERVICES = SERVICES.filter((service) =>
  fs.existsSync(path.join(DEVOS_ROOT, service, 'Dockerfile')),
);

const shouldRun = AVAILABLE_SERVICES.length > 0;

function readDockerfile(service: string): string {
  return fs.readFileSync(
    path.join(DEVOS_ROOT, service, 'Dockerfile'),
    'utf-8',
  );
}

(shouldRun ? describe : describe.skip)('Dockerfile Validation', () => {
  // Dynamically create tests for each available service
  for (const service of AVAILABLE_SERVICES) {
    describe(`${service} Dockerfile`, () => {
      it('should have 3 stages (deps, builder, production)', () => {
        const content = readDockerfile(service);
        const fromCount = (content.match(/^FROM\s+/gm) || []).length;
        expect(fromCount).toBeGreaterThanOrEqual(3);
        expect(content).toMatch(/AS\s+deps/i);
        expect(content).toMatch(/AS\s+builder/i);
        expect(content).toMatch(/AS\s+production/i);
      });
    });
  }

  it('should verify all Dockerfiles set NODE_ENV=production', () => {
    for (const service of AVAILABLE_SERVICES) {
      const content = readDockerfile(service);
      expect(content).toContain('ENV NODE_ENV=production');
    }
  });

  it('should verify all Dockerfiles create non-root users', () => {
    for (const service of AVAILABLE_SERVICES) {
      const content = readDockerfile(service);
      // Should have USER instruction (not root)
      const userMatch = content.match(/^USER\s+(\S+)/m);
      expect(userMatch).not.toBeNull();
      expect(userMatch![1]).not.toBe('root');
    }
  });

  it('should verify all Dockerfiles have EXPOSE', () => {
    const expectedPorts: Record<string, string> = {
      'devos-api': '3001',
      'devos-frontend': '3000',
      'devos-websocket': '3002',
      'devos-orchestrator': '3003',
    };

    for (const service of AVAILABLE_SERVICES) {
      const content = readDockerfile(service);
      expect(content).toContain(`EXPOSE ${expectedPorts[service]}`);
    }
  });
});
