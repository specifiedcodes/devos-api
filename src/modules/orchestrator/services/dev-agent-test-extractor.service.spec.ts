/**
 * DevAgentTestExtractorService Tests
 * Story 11.4: Dev Agent CLI Integration
 *
 * Tests for test result extraction from CLI output and explicit test runs.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DevAgentTestExtractorService } from './dev-agent-test-extractor.service';

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

import { exec } from 'child_process';

const execMock = exec as unknown as jest.Mock;

describe('DevAgentTestExtractorService', () => {
  let service: DevAgentTestExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DevAgentTestExtractorService],
    }).compile();

    service = module.get<DevAgentTestExtractorService>(
      DevAgentTestExtractorService,
    );
    execMock.mockReset();
  });

  describe('extractTestResults', () => {
    it('should parse Jest output format with passed and failed', () => {
      const output = [
        'PASS src/test.spec.ts',
        'FAIL src/other.spec.ts',
        'Test Suites: 1 passed, 1 failed, 2 total',
        'Tests:       10 passed, 2 failed, 12 total',
        'Snapshots:   0 total',
        'Time:        2.5 s',
      ];

      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.total).toBe(12);
      expect(result!.passed).toBe(10);
      expect(result!.failed).toBe(2);
      expect(result!.testCommand).toBe('npm test');
    });

    it('should parse Jest output format with only passed', () => {
      const output = [
        'PASS src/test.spec.ts',
        'Test Suites: 2 passed, 2 total',
        'Tests:       15 passed, 15 total',
        'Time:        1.2 s',
      ];

      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.total).toBe(15);
      expect(result!.passed).toBe(15);
      expect(result!.failed).toBe(0);
    });

    it('should parse Vitest output format with passed and failed', () => {
      const output = [
        ' DEV  v1.0.0',
        ' Test  10 passed | 3 failed (13)',
        ' Duration  5.2s',
      ];

      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.total).toBe(13);
      expect(result!.passed).toBe(10);
      expect(result!.failed).toBe(3);
    });

    it('should parse Vitest output format with only passed', () => {
      const output = [
        ' DEV  v1.0.0',
        ' Tests  8 passed (8)',
        ' Duration  2.1s',
      ];

      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.total).toBe(8);
      expect(result!.passed).toBe(8);
      expect(result!.failed).toBe(0);
    });

    it('should extract coverage percentage from All files pattern', () => {
      const output = [
        'Tests:       20 passed, 20 total',
        '----------|---------|----------|---------|---------|',
        'File      | % Stmts | % Branch | % Funcs | % Lines |',
        '----------|---------|----------|---------|---------|',
        'All files |  85.50% |    80.0% |   90.0% |  85.50% |',
        '----------|---------|----------|---------|---------|',
      ];

      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.coverage).toBe(85.5);
    });

    it('should extract coverage from Statements pattern', () => {
      const output = [
        'Tests:       10 passed, 10 total',
        'Statements : 92.30%',
        'Branches   : 85.00%',
      ];

      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.coverage).toBe(92.3);
    });

    it('should return null for unparseable output', () => {
      const output = [
        'Some random text',
        'No test results here',
        'Just output from compilation',
      ];

      const result = service.extractTestResults(output);

      expect(result).toBeNull();
    });

    it('should handle empty output array', () => {
      const result = service.extractTestResults([]);

      expect(result).toBeNull();
    });

    it('should handle null/undefined input', () => {
      const result = service.extractTestResults(
        null as any,
      );

      expect(result).toBeNull();
    });

    it('should return null coverage when no coverage pattern found', () => {
      const output = [
        'Tests:       5 passed, 5 total',
        'No coverage info here',
      ];

      const result = service.extractTestResults(output);

      expect(result).not.toBeNull();
      expect(result!.coverage).toBeNull();
    });
  });

  describe('runTests', () => {
    it('should execute npm test and parse output', async () => {
      execMock.mockImplementation(
        (cmd: string, opts: any, callback: Function) => {
          callback(
            null,
            'Test Suites: 3 passed\nTests:       25 passed, 25 total\n',
            '',
          );
        },
      );

      const result = await service.runTests('/tmp/workspace');

      expect(result.total).toBe(25);
      expect(result.passed).toBe(25);
      expect(result.failed).toBe(0);
      expect(execMock).toHaveBeenCalledTimes(1);
    });

    it('should handle test command failure (non-zero exit)', async () => {
      const error = new Error('Command failed') as any;
      error.code = 1;
      const testOutput = 'Tests:       8 passed, 2 failed, 10 total\n';

      execMock.mockImplementation(
        (cmd: string, opts: any, callback: Function) => {
          callback(error, testOutput, '');
        },
      );

      const result = await service.runTests('/tmp/workspace');

      expect(result.total).toBe(10);
      expect(result.passed).toBe(8);
      expect(result.failed).toBe(2);
    });

    it('should return zero results when tests not found', async () => {
      const error = new Error('npm ERR! Missing script: test');
      execMock.mockImplementation(
        (cmd: string, opts: any, callback: Function) => {
          callback(error, '', '');
        },
      );

      const result = await service.runTests('/tmp/workspace');

      expect(result.total).toBe(0);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.coverage).toBeNull();
      expect(result.testCommand).toBe('npm test');
    });

    it('should return defaults when output cannot be parsed', async () => {
      execMock.mockImplementation(
        (cmd: string, opts: any, callback: Function) => {
          callback(null, 'Compiling...\nDone.\n', '');
        },
      );

      const result = await service.runTests('/tmp/workspace');

      expect(result.total).toBe(0);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.coverage).toBeNull();
    });
  });
});
