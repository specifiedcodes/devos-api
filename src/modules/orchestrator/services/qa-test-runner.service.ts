/**
 * QATestRunnerService
 * Story 11.5: QA Agent CLI Integration
 *
 * Runs the project test suite, extracts results, and compares with
 * Dev Agent baseline to detect regressions.
 * Reuses Jest/Vitest parsing patterns from DevAgentTestExtractorService.
 */
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import {
  QATestResults,
  QAFailedTest,
  QATestComparison,
} from '../interfaces/qa-agent-execution.interfaces';
import { DevAgentTestResults } from '../interfaces/dev-agent-execution.interfaces';

/** Test command timeout: 5 minutes */
const TEST_TIMEOUT_MS = 300_000;

/** Max output buffer: 10MB (default 1MB is too small for verbose test output) */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

@Injectable()
export class QATestRunnerService {
  private readonly logger = new Logger(QATestRunnerService.name);

  /**
   * Execute a command and return stdout/stderr.
   */
  private execCommand(
    command: string,
    cwd: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      exec(
        command,
        {
          cwd,
          env: { ...process.env },
          timeout: TEST_TIMEOUT_MS,
          maxBuffer: MAX_BUFFER_BYTES,
        },
        (error, stdout, stderr) => {
          if (error) {
            (error as any).stdout = stdout;
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        },
      );
    });
  }

  /**
   * Run the project test suite and extract results.
   * Executes npm test with coverage and CI flags.
   *
   * @param workspacePath - Local workspace directory
   * @returns QATestResults with test counts, coverage, and failed test details
   */
  async runTestSuite(workspacePath: string): Promise<QATestResults> {
    const testCommand = 'npm test -- --ci --coverage 2>&1';

    this.logger.log(
      `Running test suite in ${workspacePath}: ${testCommand}`,
    );

    try {
      const { stdout } = await this.execCommand(
        testCommand,
        workspacePath,
      );

      const result = this.extractTestResults(stdout.split('\n'));
      if (result) {
        return result;
      }

      return this.defaultResults();
    } catch (error: any) {
      // Non-zero exit code means some tests failed - parse what's available
      const stdout = error?.stdout || '';
      const result = this.extractTestResults(
        stdout.toString().split('\n'),
      );

      if (result) {
        return result;
      }

      this.logger.warn(
        `Test command failed and output could not be parsed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return this.defaultResults();
    }
  }

  /**
   * Extract test results from CLI session output.
   * Parses common test runner output formats (Jest, Vitest).
   *
   * @param cliOutput - Array of output lines from the CLI session
   * @returns Parsed test results or null if no patterns match
   */
  extractTestResults(cliOutput: string[]): QATestResults | null {
    if (!cliOutput || cliOutput.length === 0) {
      return null;
    }

    const fullOutput = cliOutput.join('\n');

    // Extract failed test details first (shared across formats)
    const failedTests = this.extractFailedTests(fullOutput);

    // Try Jest format first
    const jestResult = this.parseJestOutput(fullOutput);
    if (jestResult) {
      jestResult.failedTests = failedTests;
      return jestResult;
    }

    // Try Vitest format
    const vitestResult = this.parseVitestOutput(fullOutput);
    if (vitestResult) {
      vitestResult.failedTests = failedTests;
      return vitestResult;
    }

    return null;
  }

  /**
   * Compare QA test results with Dev Agent baseline.
   * Detects regressions (tests that passed before but fail now).
   *
   * @param current - Current QA test results
   * @param baseline - Dev Agent baseline results (may be null)
   * @returns QATestComparison with deltas and regression info
   */
  compareWithBaseline(
    current: QATestResults,
    baseline: DevAgentTestResults | null,
  ): QATestComparison {
    if (!baseline) {
      return {
        totalDelta: 0,
        passedDelta: 0,
        failedDelta: 0,
        coverageDelta: null,
        hasRegressions: false,
        regressionCount: 0,
      };
    }

    const totalDelta = current.total - baseline.total;
    const passedDelta = current.passed - baseline.passed;
    const failedDelta = current.failed - baseline.failed;

    // Coverage delta: only calculate if both have coverage
    let coverageDelta: number | null = null;
    if (current.coverage !== null && baseline.coverage !== null) {
      coverageDelta = current.coverage - baseline.coverage;
    }

    // Regressions: more tests are failing now than in the baseline.
    // A positive failedDelta means the number of failing tests increased,
    // which indicates regressions (or new failing tests were introduced).
    // We also verify passedDelta is negative as a secondary signal:
    // if passed count dropped while failed count rose, it's a true regression.
    const hasRegressions = failedDelta > 0 && passedDelta < 0;
    const regressionCount = hasRegressions
      ? Math.min(Math.abs(passedDelta), failedDelta)
      : 0;

    return {
      totalDelta,
      passedDelta,
      failedDelta,
      coverageDelta,
      hasRegressions,
      regressionCount,
    };
  }

  /**
   * Parse Jest-style test output.
   */
  private parseJestOutput(output: string): QATestResults | null {
    const totalMatch = output.match(/Tests:\s+.*?(\d+)\s+total/);
    if (!totalMatch) return null;

    const total = parseInt(totalMatch[1], 10);

    const passedMatch = output.match(/Tests:\s+.*?(\d+)\s+passed/);
    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;

    const failedMatch = output.match(/Tests:\s+.*?(\d+)\s+failed/);
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : total - passed;

    const skippedMatch = output.match(/Tests:\s+.*?(\d+)\s+skipped/);
    const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;

    const coverage = this.extractCoverage(output);

    return {
      total,
      passed,
      failed,
      skipped,
      coverage,
      testCommand: 'npm test -- --ci --coverage',
      failedTests: [],
    };
  }

  /**
   * Parse Vitest-style test output.
   */
  private parseVitestOutput(output: string): QATestResults | null {
    // Pattern with passed AND failed
    const withFailedMatch = output.match(
      /Tests?\s+(\d+)\s+passed\s*\|\s*(\d+)\s+failed\s*\((\d+)\)/,
    );
    if (withFailedMatch) {
      const passed = parseInt(withFailedMatch[1], 10);
      const failed = parseInt(withFailedMatch[2], 10);
      const total = parseInt(withFailedMatch[3], 10);
      const coverage = this.extractCoverage(output);

      return {
        total,
        passed,
        failed,
        skipped: 0,
        coverage,
        testCommand: 'npm test -- --ci --coverage',
        failedTests: [],
      };
    }

    // Pattern with only passed
    const passedOnlyMatch = output.match(
      /Tests?\s+(\d+)\s+passed\s*\((\d+)\)/,
    );
    if (passedOnlyMatch) {
      const passed = parseInt(passedOnlyMatch[1], 10);
      const total = parseInt(passedOnlyMatch[2], 10);
      const coverage = this.extractCoverage(output);

      return {
        total,
        passed,
        failed: 0,
        skipped: 0,
        coverage,
        testCommand: 'npm test -- --ci --coverage',
        failedTests: [],
      };
    }

    return null;
  }

  /**
   * Extract test coverage percentage from output.
   */
  private extractCoverage(output: string): number | null {
    // Pattern: "All files | XX.XX%"
    const allFilesMatch = output.match(/All files\s*\|\s*([\d.]+)%/);
    if (allFilesMatch) {
      return parseFloat(allFilesMatch[1]);
    }

    // Pattern: "Statements : XX.XX%"
    const statementsMatch = output.match(/Statements\s*:\s*([\d.]+)%/);
    if (statementsMatch) {
      return parseFloat(statementsMatch[1]);
    }

    return null;
  }

  /**
   * Extract failed test names and details from test output.
   */
  private extractFailedTests(output: string): QAFailedTest[] {
    const failedTests: QAFailedTest[] = [];

    // Match "FAIL <filepath>" lines
    const failFileMatches = output.matchAll(/^FAIL\s+(.+)$/gm);
    for (const match of failFileMatches) {
      const file = match[1].trim();
      failedTests.push({
        testName: `Tests in ${file}`,
        file,
        error: 'See test output for details',
      });
    }

    // Try to find specific "● <test name>" patterns (Jest)
    const testNameMatches = output.matchAll(
      /^\s+●\s+(.+)$/gm,
    );
    for (const match of testNameMatches) {
      const testName = match[1].trim();
      // Find which FAIL file this belongs to (look backward in output)
      const existingEntry = failedTests.find((ft) =>
        output.indexOf(`● ${testName}`) > output.indexOf(`FAIL ${ft.file}`),
      );
      if (existingEntry) {
        existingEntry.testName = testName;
      }
    }

    return failedTests;
  }

  /**
   * Return default test results when parsing fails.
   */
  private defaultResults(): QATestResults {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      coverage: null,
      testCommand: 'npm test -- --ci --coverage',
      failedTests: [],
    };
  }
}
