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

describe('Type-Check Scripts', () => {
  it('should have type-check script in all package.json files', () => {
    for (const repo of REPOS) {
      const pkgPath = path.join(DEVOS_ROOT, repo, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.scripts['type-check']).toBe('tsc --noEmit');
    }
  });

  // Validate each repo's package.json individually
  for (const repo of REPOS) {
    it(`should have type-check script in ${repo}/package.json`, () => {
      const pkgPath = path.join(DEVOS_ROOT, repo, 'package.json');
      expect(fs.existsSync(pkgPath)).toBe(true);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts['type-check']).toBe('tsc --noEmit');
    });
  }
});
