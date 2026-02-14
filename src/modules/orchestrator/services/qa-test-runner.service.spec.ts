/**
 * QATestRunnerService Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * Tests for test suite execution, result extraction, and baseline comparison.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { QATestRunnerService } from './qa-test-runner.service';
import * as childProcess from 'child_process';

// Mock child_process.exec
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

const mockedExec = childProcess.exec as unknown as jest.Mock;

describe('QATestRunnerService', () => {
  let service: QATestRunnerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QATestRunnerService],
    }).compile();

    service = module.get<QATestRunnerService>(QATestRunnerService);
    jest.clearAllMocks();
  });

  describe('runTestSuite', () => {
    it('should execute npm test with --ci --coverage flags', async () => {
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'Tests:       10 passed, 10 total\n', '');
      });

      await service.runTestSuite('/workspace');

      expect(mockedExec).toHaveBeenCalledWith(
        expect.stringContaining('npm test'),
        expect.objectContaining({ cwd: '/workspace' }),
        expect.any(Function),
      );
      expect(mockedExec.mock.calls[0][0]).toContain('--ci');
      expect(mockedExec.mock.calls[0][0]).toContain('--coverage');
    });

    it('should parse Jest output format correctly', async () => {
      const jestOutput = `
PASS src/app.spec.ts
PASS src/service.spec.ts

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        3.2 s
`;
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(null, jestOutput, '');
      });

      const result = await service.runTestSuite('/workspace');

      expect(result.total).toBe(15);
      expect(result.passed).toBe(15);
      expect(result.failed).toBe(0);
    });

    it('should parse Vitest output format correctly', async () => {
      const vitestOutput = `
 ✓ src/app.spec.ts (5)
 ✓ src/service.spec.ts (3)

Tests  8 passed (8)
`;
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(null, vitestOutput, '');
      });

      const result = await service.runTestSuite('/workspace');

      expect(result.total).toBe(8);
      expect(result.passed).toBe(8);
      expect(result.failed).toBe(0);
    });

    it('should extract individual failed test details', async () => {
      const output = `
FAIL src/broken.spec.ts
  ● Test Suite > should work

    expect(received).toBe(expected)

    Expected: true
    Received: false

      at Object.<anonymous> (src/broken.spec.ts:10:20)

Tests:       1 failed, 5 passed, 6 total
`;
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('Non-zero exit');
        error.stdout = output;
        cb(error, output, '');
      });

      const result = await service.runTestSuite('/workspace');

      expect(result.total).toBe(6);
      expect(result.passed).toBe(5);
      expect(result.failed).toBe(1);
    });

    it('should return default results when parsing fails', async () => {
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(null, 'No recognizable test output here', '');
      });

      const result = await service.runTestSuite('/workspace');

      expect(result.total).toBe(0);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.coverage).toBeNull();
    });

    it('should handle test command timeout', async () => {
      mockedExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        const error: any = new Error('Command timed out');
        error.killed = true;
        error.stdout = '';
        cb(error, '', '');
      });

      const result = await service.runTestSuite('/workspace');

      expect(result.total).toBe(0);
      expect(result.passed).toBe(0);
    });
  });

  describe('extractTestResults', () => {
    it('should parse CLI output for test results', () => {
      const output = ['Tests:       20 passed, 3 failed, 23 total'];
      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.total).toBe(23);
      expect(result!.passed).toBe(20);
      expect(result!.failed).toBe(3);
    });

    it('should return null for unparseable output', () => {
      const output = ['Some random log output', 'Nothing useful here'];
      const result = service.extractTestResults(output);

      expect(result).toBeNull();
    });

    it('should extract coverage from output', () => {
      const output = [
        'Tests:       10 passed, 10 total',
        'Statements : 92.50%',
      ];
      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.coverage).toBe(92.5);
    });

    it('should handle empty output', () => {
      const result = service.extractTestResults([]);
      expect(result).toBeNull();
    });

    it('should parse failed test names from FAIL markers', () => {
      const output = [
        'FAIL src/broken.spec.ts',
        '  ● should handle errors',
        '',
        'Tests:       1 failed, 4 passed, 5 total',
      ];
      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.failed).toBe(1);
      expect(result!.failedTests.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('compareWithBaseline', () => {
    it('should detect regressions (previously passing tests now fail)', () => {
      const current = {
        total: 10, passed: 8, failed: 2, skipped: 0,
        coverage: 80, testCommand: 'npm test', failedTests: [],
      };
      const baseline = {
        total: 10, passed: 10, failed: 0,
        coverage: 85, testCommand: 'npm test',
      };

      const comparison = service.compareWithBaseline(current, baseline);

      expect(comparison.hasRegressions).toBe(true);
      expect(comparison.regressionCount).toBe(2);
      expect(comparison.failedDelta).toBe(2);
    });

    it('should calculate coverage delta correctly', () => {
      const current = {
        total: 15, passed: 15, failed: 0, skipped: 0,
        coverage: 90, testCommand: 'npm test', failedTests: [],
      };
      const baseline = {
        total: 10, passed: 10, failed: 0,
        coverage: 85, testCommand: 'npm test',
      };

      const comparison = service.compareWithBaseline(current, baseline);

      expect(comparison.coverageDelta).toBe(5);
      expect(comparison.totalDelta).toBe(5);
      expect(comparison.passedDelta).toBe(5);
      expect(comparison.hasRegressions).toBe(false);
    });

    it('should handle null baseline gracefully', () => {
      const current = {
        total: 10, passed: 10, failed: 0, skipped: 0,
        coverage: 85, testCommand: 'npm test', failedTests: [],
      };

      const comparison = service.compareWithBaseline(current, null);

      expect(comparison.hasRegressions).toBe(false);
      expect(comparison.regressionCount).toBe(0);
      expect(comparison.totalDelta).toBe(0);
      expect(comparison.passedDelta).toBe(0);
      expect(comparison.failedDelta).toBe(0);
      expect(comparison.coverageDelta).toBeNull();
    });

    it('should handle null coverage in both current and baseline', () => {
      const current = {
        total: 10, passed: 10, failed: 0, skipped: 0,
        coverage: null, testCommand: 'npm test', failedTests: [],
      };
      const baseline = {
        total: 10, passed: 10, failed: 0,
        coverage: null, testCommand: 'npm test',
      };

      const comparison = service.compareWithBaseline(current, baseline);

      expect(comparison.coverageDelta).toBeNull();
    });
  });
});
