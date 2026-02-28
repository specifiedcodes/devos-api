import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DEVOS_ROOT = path.resolve(__dirname, '../../../../..');
const SCRIPT_PATH = path.join(DEVOS_ROOT, 'devos-api', 'scripts', 'ci-coverage-check.sh');
const shouldRun = fs.existsSync(SCRIPT_PATH);

(shouldRun ? describe : describe.skip)('Coverage Check Script', () => {
  const tmpDir = path.join(DEVOS_ROOT, 'devos-api', '.tmp-coverage-test');

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, 'coverage'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should exist', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });

  it('should pass when coverage >= 80%', () => {
    const coverageSummary = {
      total: {
        lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
        statements: { total: 100, covered: 85, skipped: 0, pct: 85 },
        functions: { total: 50, covered: 43, skipped: 0, pct: 86 },
        branches: { total: 40, covered: 34, skipped: 0, pct: 85 },
      },
    };

    fs.writeFileSync(
      path.join(tmpDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify(coverageSummary),
    );

    const result = execSync(`bash ${SCRIPT_PATH}`, {
      cwd: tmpDir,
      env: { ...process.env, GITHUB_STEP_SUMMARY: path.join(tmpDir, 'summary.md') },
    });

    expect(result.toString()).toContain('Coverage check passed');
  });

  it('should fail when coverage < 80%', () => {
    const coverageSummary = {
      total: {
        lines: { total: 100, covered: 75, skipped: 0, pct: 75 },
        statements: { total: 100, covered: 75, skipped: 0, pct: 75 },
        functions: { total: 50, covered: 38, skipped: 0, pct: 76 },
        branches: { total: 40, covered: 28, skipped: 0, pct: 70 },
      },
    };

    fs.writeFileSync(
      path.join(tmpDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify(coverageSummary),
    );

    expect(() => {
      execSync(`bash ${SCRIPT_PATH}`, {
        cwd: tmpDir,
        env: { ...process.env, GITHUB_STEP_SUMMARY: path.join(tmpDir, 'summary.md') },
      });
    }).toThrow();
  });

  it('should handle missing coverage file gracefully', () => {
    // Remove coverage file - should not exist
    fs.rmSync(path.join(tmpDir, 'coverage'), { recursive: true, force: true });

    const result = execSync(`bash ${SCRIPT_PATH}`, {
      cwd: tmpDir,
      env: { ...process.env, GITHUB_STEP_SUMMARY: path.join(tmpDir, 'summary.md') },
    });

    expect(result.toString()).toContain('Coverage file not found');
  });

  it('should use custom threshold from COVERAGE_THRESHOLD env', () => {
    const coverageSummary = {
      total: {
        lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
        statements: { total: 100, covered: 85, skipped: 0, pct: 85 },
        functions: { total: 50, covered: 43, skipped: 0, pct: 86 },
        branches: { total: 40, covered: 34, skipped: 0, pct: 85 },
      },
    };

    fs.writeFileSync(
      path.join(tmpDir, 'coverage', 'coverage-summary.json'),
      JSON.stringify(coverageSummary),
    );

    // With threshold=90, 85% should fail
    expect(() => {
      execSync(`bash ${SCRIPT_PATH}`, {
        cwd: tmpDir,
        env: {
          ...process.env,
          COVERAGE_THRESHOLD: '90',
          GITHUB_STEP_SUMMARY: path.join(tmpDir, 'summary.md'),
        },
      });
    }).toThrow();
  });
});
