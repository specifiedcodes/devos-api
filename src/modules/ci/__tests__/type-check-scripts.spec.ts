import * as fs from 'fs';
import * as path from 'path';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const REPOS = [
  'devos-api',
  'devos-frontend',
  'devos-orchestrator',
  'devos-websocket',
  'devos-shared',
  'devos-integrations',
];

const AVAILABLE_REPOS = REPOS.filter((repo) => {
  const pkgPath = path.join(DEVOS_ROOT, repo, 'package.json');
  return fs.existsSync(pkgPath);
});

const isMonorepo = AVAILABLE_REPOS.length > 1;

function isValidTypeCheckScript(script: string): boolean {
  return script === 'tsc --noEmit' || script.includes('tsc') && script.includes('--noEmit');
}

describe('Type-Check Scripts', () => {
  if (!isMonorepo) {
    it.skip('should have type-check script in all package.json files (skipped: not in monorepo)', () => {});
    return;
  }

  it('should have type-check script in all package.json files', () => {
    for (const repo of AVAILABLE_REPOS) {
      const pkgPath = path.join(DEVOS_ROOT, repo, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(isValidTypeCheckScript(pkg.scripts['type-check'])).toBe(true);
    }
  });

  for (const repo of AVAILABLE_REPOS) {
    it(`should have type-check script in ${repo}/package.json`, () => {
      const pkgPath = path.join(DEVOS_ROOT, repo, 'package.json');
      expect(fs.existsSync(pkgPath)).toBe(true);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.scripts).toBeDefined();
      expect(isValidTypeCheckScript(pkg.scripts['type-check'])).toBe(true);
    });
  }
});
