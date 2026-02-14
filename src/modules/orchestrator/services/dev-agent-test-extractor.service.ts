/**
 * DevAgentTestExtractorService
 * Story 11.4: Dev Agent CLI Integration
 *
 * Extracts test results from CLI session output or runs tests explicitly.
 * Supports Jest and Vitest output formats, and coverage extraction.
 */
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { DevAgentTestResults } from '../interfaces/dev-agent-execution.interfaces';

/** Test command timeout: 5 minutes */
const TEST_TIMEOUT_MS = 300_000;

@Injectable()
export class DevAgentTestExtractorService {
  private readonly logger = new Logger(DevAgentTestExtractorService.name);

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
        },
        (error, stdout, stderr) => {
          if (error) {
            // Attach stdout to the error for parsing
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
   * Extract test results from CLI session output.
   * Parses common test runner output formats (Jest, Vitest, Mocha).
   *
   * @param cliOutput - Array of output lines from the CLI session
   * @returns Parsed test results or null if no patterns match
   */
  extractTestResults(cliOutput: string[]): DevAgentTestResults | null {
    if (!cliOutput || cliOutput.length === 0) {
      return null;
    }

    const fullOutput = cliOutput.join('\n');

    // Try Jest format first
    const jestResult = this.parseJestOutput(fullOutput);
    if (jestResult) return jestResult;

    // Try Vitest format
    const vitestResult = this.parseVitestOutput(fullOutput);
    if (vitestResult) return vitestResult;

    return null;
  }

  /**
   * Run tests explicitly in the workspace directory.
   * Called when test results cannot be extracted from CLI output.
   *
   * @param workspacePath - Local workspace directory
   * @returns Test results (with defaults if parsing fails)
   */
  async runTests(workspacePath: string): Promise<DevAgentTestResults> {
    const testCommand = 'npm test -- --ci --coverage 2>&1';

    this.logger.log(
      `Running tests in ${workspacePath}: ${testCommand}`,
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

      // Tests ran but output couldn't be parsed
      return {
        total: 0,
        passed: 0,
        failed: 0,
        coverage: null,
        testCommand: 'npm test',
      };
    } catch (error: any) {
      // Non-zero exit code means some tests failed
      // Try to parse the output that exists
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

      return {
        total: 0,
        passed: 0,
        failed: 0,
        coverage: null,
        testCommand: 'npm test',
      };
    }
  }

  /**
   * Parse Jest-style test output.
   *
   * Matches patterns like:
   * - "Tests:       3 passed, 1 failed, 4 total"
   * - "Tests:       10 passed, 10 total"
   * - "Tests:       8 passed, 2 skipped, 10 total"
   * - "Tests:       5 passed, 1 failed, 2 skipped, 8 total"
   */
  private parseJestOutput(output: string): DevAgentTestResults | null {
    // General pattern: extract total from the end, then look for passed/failed counts
    const totalMatch = output.match(/Tests:\s+.*?(\d+)\s+total/);
    if (!totalMatch) return null;

    const total = parseInt(totalMatch[1], 10);

    // Extract passed count
    const passedMatch = output.match(/Tests:\s+.*?(\d+)\s+passed/);
    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;

    // Extract failed count
    const failedMatch = output.match(/Tests:\s+.*?(\d+)\s+failed/);
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : total - passed;

    const coverage = this.extractCoverage(output);

    return {
      total,
      passed,
      failed,
      coverage,
      testCommand: 'npm test',
    };
  }

  /**
   * Parse Vitest-style test output.
   *
   * Matches patterns like:
   * - "Test Files  3 passed | 1 failed (4)"
   * - "Tests  10 passed | 2 failed (12)"
   * - "Test Files  5 passed (5)"
   */
  private parseVitestOutput(output: string): DevAgentTestResults | null {
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
        coverage,
        testCommand: 'npm test',
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
        coverage,
        testCommand: 'npm test',
      };
    }

    return null;
  }

  /**
   * Extract test coverage percentage from output.
   *
   * Matches patterns like:
   * - "All files  |  85.50% | ..."
   * - "Statements : 90.00%"
   */
  private extractCoverage(output: string): number | null {
    // Pattern: "All files | XX.XX%"
    const allFilesMatch = output.match(
      /All files\s*\|\s*([\d.]+)%/,
    );
    if (allFilesMatch) {
      return parseFloat(allFilesMatch[1]);
    }

    // Pattern: "Statements : XX.XX%"
    const statementsMatch = output.match(
      /Statements\s*:\s*([\d.]+)%/,
    );
    if (statementsMatch) {
      return parseFloat(statementsMatch[1]);
    }

    return null;
  }
}
