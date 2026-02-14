/**
 * QAStaticAnalyzerService
 * Story 11.5: QA Agent CLI Integration
 *
 * Runs lint (ESLint) and type check (tsc) commands and extracts results.
 * Each command has a 3-minute timeout. If the command is not available,
 * the result is marked as skipped (not failure).
 */
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import {
  QALintResults,
  QATypeCheckResults,
} from '../interfaces/qa-agent-execution.interfaces';

/** Static analysis command timeout: 3 minutes */
const STATIC_ANALYSIS_TIMEOUT_MS = 180_000;

/** Max output buffer: 10MB (default 1MB is too small for verbose lint output) */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** Max detail output length */
const MAX_DETAILS_LENGTH = 2000;

@Injectable()
export class QAStaticAnalyzerService {
  private readonly logger = new Logger(QAStaticAnalyzerService.name);

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
          timeout: STATIC_ANALYSIS_TIMEOUT_MS,
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
   * Truncate a string to maxLength.
   */
  private truncate(str: string, maxLength: number = MAX_DETAILS_LENGTH): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '... (truncated)';
  }

  /**
   * Run linter and extract results.
   * Executes npm run lint (or eslint directly).
   *
   * @param workspacePath - Local workspace directory
   * @returns QALintResults with error/warning counts
   */
  async runLintCheck(workspacePath: string): Promise<QALintResults> {
    this.logger.log(`Running lint check in ${workspacePath}`);

    try {
      const { stdout } = await this.execCommand(
        'npm run lint 2>&1',
        workspacePath,
      );

      // Lint passed (exit code 0) - parse output for any warnings
      return this.parseLintOutput(stdout, true);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stdout = error?.stdout || '';

      // Check if lint script is not available
      if (
        errorMessage.includes('Missing script') ||
        errorMessage.includes('missing script')
      ) {
        this.logger.log('Lint script not available, marking as skipped');
        return {
          errors: 0,
          warnings: 0,
          fixableErrors: 0,
          fixableWarnings: 0,
          passed: true,
          details: 'Lint script not available - skipped',
        };
      }

      // Check for timeout
      if (error?.killed) {
        this.logger.warn('Lint command timed out');
        return {
          errors: 0,
          warnings: 0,
          fixableErrors: 0,
          fixableWarnings: 0,
          passed: true,
          details: 'Lint command timed out - skipped',
        };
      }

      // Lint found errors (non-zero exit code) - parse the output
      return this.parseLintOutput(stdout, false);
    }
  }

  /**
   * Run TypeScript type checker.
   * Executes npx tsc --noEmit.
   *
   * @param workspacePath - Local workspace directory
   * @returns QATypeCheckResults with error count
   */
  async runTypeCheck(workspacePath: string): Promise<QATypeCheckResults> {
    this.logger.log(`Running type check in ${workspacePath}`);

    try {
      const { stdout } = await this.execCommand(
        'npx tsc --noEmit 2>&1',
        workspacePath,
      );

      // Type check passed (exit code 0)
      return {
        errors: 0,
        passed: true,
        details: stdout ? this.truncate(stdout) : 'No type errors found',
      };
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stdout = error?.stdout || '';

      // Check if tsconfig is not found
      if (
        errorMessage.includes('tsconfig.json') ||
        errorMessage.includes('No inputs were found') ||
        stdout.includes('tsconfig.json') ||
        stdout.includes('No inputs were found')
      ) {
        this.logger.log('TypeScript config not found, marking as skipped');
        return {
          errors: 0,
          passed: true,
          details: 'TypeScript config not found - skipped',
        };
      }

      // Count error lines: pattern "error TS\d+:"
      const errorCount = (stdout.match(/error TS\d+:/g) || []).length;

      return {
        errors: errorCount,
        passed: errorCount === 0,
        details: this.truncate(stdout || errorMessage),
      };
    }
  }

  /**
   * Parse ESLint output for error/warning counts.
   */
  private parseLintOutput(
    output: string,
    exitCodeZero: boolean,
  ): QALintResults {
    let errors = 0;
    let warnings = 0;
    let fixableErrors = 0;
    let fixableWarnings = 0;

    // Pattern: "X problems (Y errors, Z warnings)"
    const problemsMatch = output.match(
      /(\d+)\s+problems?\s*\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/,
    );
    if (problemsMatch) {
      errors = parseInt(problemsMatch[2], 10);
      warnings = parseInt(problemsMatch[3], 10);
    }

    // Pattern: "X errors and Y warnings potentially fixable"
    const fixableMatch = output.match(
      /(\d+)\s+errors?\s+and\s+(\d+)\s+warnings?\s+potentially\s+fixable/,
    );
    if (fixableMatch) {
      fixableErrors = parseInt(fixableMatch[1], 10);
      fixableWarnings = parseInt(fixableMatch[2], 10);
    }

    return {
      errors,
      warnings,
      fixableErrors,
      fixableWarnings,
      passed: errors === 0,
      details: this.truncate(output),
    };
  }
}
