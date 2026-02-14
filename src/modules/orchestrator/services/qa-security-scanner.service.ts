/**
 * QASecurityScannerService
 * Story 11.5: QA Agent CLI Integration
 *
 * Runs npm audit for dependency vulnerabilities and scans source files
 * for hardcoded secrets using regex patterns.
 */
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  QASecurityScan,
  QASecretScanResult,
} from '../interfaces/qa-agent-execution.interfaces';

/** npm audit timeout: 2 minutes */
const AUDIT_TIMEOUT_MS = 120_000;

/** Max output buffer: 10MB (default 1MB is too small for large audit JSON) */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** Max detail output length */
const MAX_DETAILS_LENGTH = 2000;

/** Files to skip during secret scanning */
const SKIP_PATTERNS = [
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /\.spec\.js$/,
  /\.test\.js$/,
  /\.md$/,
  /\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /node_modules\//,
];

/** Secret detection patterns (case-insensitive, NOT global - avoids lastIndex issues with test()) */
const SECRET_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  {
    regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{10,}/i,
    label: 'API_KEY',
  },
  {
    regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+/i,
    label: 'PASSWORD',
  },
  {
    regex: /(?:token|secret|auth[_-]?key)\s*[:=]\s*['"][^'"]{10,}/i,
    label: 'TOKEN',
  },
  {
    regex: /(?:mongodb|postgres|mysql|redis):\/\/[^'")\s]+/i,
    label: 'CONNECTION_STRING',
  },
];

@Injectable()
export class QASecurityScannerService {
  private readonly logger = new Logger(QASecurityScannerService.name);

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
          timeout: AUDIT_TIMEOUT_MS,
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
   * Run npm audit for dependency vulnerabilities.
   *
   * @param workspacePath - Local workspace directory
   * @returns QASecurityScan with vulnerability counts
   */
  async runNpmAudit(workspacePath: string): Promise<QASecurityScan> {
    this.logger.log(`Running npm audit in ${workspacePath}`);

    try {
      const { stdout } = await this.execCommand(
        'npm audit --json 2>&1',
        workspacePath,
      );
      return this.parseAuditJson(stdout);
    } catch (error: any) {
      const stdout = error?.stdout || '';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // npm audit exits with non-zero when vulnerabilities are found
      // Try to parse the JSON output from stdout
      if (stdout) {
        try {
          return this.parseAuditJson(stdout);
        } catch {
          // JSON parsing failed, fall through
        }
      }

      // If npm audit is not available or JSON is unparseable
      this.logger.warn(
        `npm audit failed or not available: ${errorMessage}`,
      );

      return {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0,
        passed: true,
        details: `npm audit not available or failed: ${this.truncate(errorMessage)}`,
      };
    }
  }

  /**
   * Scan files for hardcoded secrets using regex patterns.
   * Checks for API keys, passwords, tokens, connection strings.
   *
   * @param workspacePath - Local workspace directory
   * @param changedFiles - List of changed file paths (relative to workspace)
   * @returns QASecretScanResult with findings
   */
  scanForSecrets(
    workspacePath: string,
    changedFiles: string[],
  ): QASecretScanResult {
    const findings: Array<{ file: string; line: number; pattern: string }> = [];

    for (const filePath of changedFiles) {
      // Skip test files, docs, and lock files
      if (this.shouldSkipFile(filePath)) {
        continue;
      }

      try {
        const fullPath = join(workspacePath, filePath);
        if (!existsSync(fullPath)) {
          continue;
        }

        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          for (const { regex, label } of SECRET_PATTERNS) {
            if (regex.test(line)) {
              findings.push({
                file: filePath,
                line: lineNum + 1,
                pattern: label,
              });
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to read file ${filePath} for secret scanning: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return {
      secretsFound: findings.length > 0,
      findings,
    };
  }

  /**
   * Check if a file should be skipped during secret scanning.
   */
  private shouldSkipFile(filePath: string): boolean {
    return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
  }

  /**
   * Parse npm audit JSON output.
   */
  private parseAuditJson(jsonStr: string): QASecurityScan {
    const data = JSON.parse(jsonStr);

    // npm audit v2+ format
    const vulns = data.metadata?.vulnerabilities || {};
    const critical = vulns.critical || 0;
    const high = vulns.high || 0;
    const medium = vulns.moderate || vulns.medium || 0;
    const low = vulns.low || 0;
    const total = vulns.total || critical + high + medium + low;

    return {
      critical,
      high,
      medium,
      low,
      total,
      passed: critical === 0 && high === 0,
      details: this.truncate(jsonStr),
    };
  }
}
