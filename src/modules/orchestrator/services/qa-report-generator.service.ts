/**
 * QAReportGeneratorService
 * Story 11.5: QA Agent CLI Integration
 *
 * Assembles comprehensive QA reports from all check results and
 * determines the overall verdict using rule-based logic.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  QAReport,
  QATestResults,
  QATestComparison,
  QALintResults,
  QATypeCheckResults,
  QASecurityScan,
  QASecretScanResult,
  QAAcceptanceCriterionResult,
  QACoverageAnalysis,
  QA_COVERAGE_THRESHOLD,
  QA_COVERAGE_BORDERLINE_THRESHOLD,
} from '../interfaces/qa-agent-execution.interfaces';

/**
 * Parameters for building a QA report.
 */
export interface QAReportBuildParams {
  storyId: string;
  testResults: QATestResults;
  testComparison: QATestComparison;
  lintResults: QALintResults;
  typeCheckResults: QATypeCheckResults;
  securityScan: QASecurityScan;
  secretScan: QASecretScanResult;
  acceptanceCriteria: QAAcceptanceCriterionResult[];
  additionalTestsWritten: number;
}

@Injectable()
export class QAReportGeneratorService {
  private readonly logger = new Logger(QAReportGeneratorService.name);

  /**
   * Build a comprehensive QA report from all check results.
   *
   * @param params - All check results to include in the report
   * @returns QAReport with verdict, results, and summary
   */
  buildReport(params: QAReportBuildParams): QAReport {
    const coverageAnalysis = this.buildCoverageAnalysis(
      params.testResults,
      params.testComparison,
    );

    const comments = this.generateComments(params, coverageAnalysis);
    const summary = this.generateSummary(params, coverageAnalysis);

    const report: QAReport = {
      storyId: params.storyId,
      verdict: 'PASS', // Will be determined below
      testResults: params.testResults,
      securityScan: params.securityScan,
      lintResults: params.lintResults,
      typeCheckResults: params.typeCheckResults,
      acceptanceCriteria: params.acceptanceCriteria,
      coverageAnalysis,
      comments,
      summary,
    };

    report.verdict = this.determineVerdict(report, params);

    return report;
  }

  /**
   * Determine the overall verdict based on all checks.
   *
   * FAIL conditions:
   * - Test regressions detected
   * - Critical/high security vulnerabilities found
   * - Hardcoded secrets found
   * - >50% of acceptance criteria not met
   *
   * NEEDS_CHANGES conditions:
   * - Coverage < 80% but >= 70%
   * - Lint warnings (not errors)
   * - Single acceptance criterion unclear
   * - Minor issues
   *
   * PASS conditions:
   * - All tests pass
   * - Coverage >= 80%
   * - No critical lint errors
   * - No critical/high security issues
   * - No secrets
   * - All acceptance criteria met
   */
  determineVerdict(
    report: QAReport,
    params: QAReportBuildParams,
  ): 'PASS' | 'FAIL' | 'NEEDS_CHANGES' {
    // === FAIL conditions ===

    // Test regressions
    if (params.testComparison.hasRegressions) {
      this.logger.log(
        `Verdict: FAIL - ${params.testComparison.regressionCount} test regressions detected`,
      );
      return 'FAIL';
    }

    // Critical/high security vulnerabilities
    if (!report.securityScan.passed) {
      this.logger.log(
        `Verdict: FAIL - critical/high security vulnerabilities found`,
      );
      return 'FAIL';
    }

    // Hardcoded secrets
    if (params.secretScan.secretsFound) {
      this.logger.log(
        `Verdict: FAIL - hardcoded secrets detected in ${params.secretScan.findings.length} location(s)`,
      );
      return 'FAIL';
    }

    // More than 50% of acceptance criteria not met
    const totalCriteria = report.acceptanceCriteria.length;
    const metCriteria = report.acceptanceCriteria.filter((c) => c.met).length;
    const unmetCriteria = totalCriteria - metCriteria;

    if (totalCriteria > 0 && unmetCriteria > totalCriteria / 2) {
      this.logger.log(
        `Verdict: FAIL - ${unmetCriteria}/${totalCriteria} acceptance criteria not met`,
      );
      return 'FAIL';
    }

    // === NEEDS_CHANGES conditions ===

    // Type check errors (checked first as they indicate non-compiling code)
    if (!report.typeCheckResults.passed) {
      this.logger.log(`Verdict: NEEDS_CHANGES - type check errors found`);
      return 'NEEDS_CHANGES';
    }

    // Lint errors (not warnings)
    if (!report.lintResults.passed) {
      this.logger.log(`Verdict: NEEDS_CHANGES - lint errors found`);
      return 'NEEDS_CHANGES';
    }

    // Coverage below threshold but above borderline
    const coverage = report.testResults.coverage;
    if (
      coverage !== null &&
      coverage < QA_COVERAGE_THRESHOLD &&
      coverage >= QA_COVERAGE_BORDERLINE_THRESHOLD
    ) {
      this.logger.log(
        `Verdict: NEEDS_CHANGES - coverage ${coverage}% below ${QA_COVERAGE_THRESHOLD}% threshold`,
      );
      return 'NEEDS_CHANGES';
    }

    // Coverage below borderline is a FAIL
    if (coverage !== null && coverage < QA_COVERAGE_BORDERLINE_THRESHOLD) {
      this.logger.log(
        `Verdict: FAIL - coverage ${coverage}% critically below threshold`,
      );
      return 'FAIL';
    }

    // Any acceptance criteria not met (but not >50%)
    if (totalCriteria > 0 && unmetCriteria > 0) {
      // Check if the unmet criteria are "unable to verify" (less severe)
      const unmetItems = report.acceptanceCriteria.filter((c) => !c.met);
      const allUnverifiable = unmetItems.every((c) =>
        c.evidence.toLowerCase().includes('unable to verify'),
      );

      if (allUnverifiable) {
        this.logger.log(
          `Verdict: NEEDS_CHANGES - ${unmetCriteria} acceptance criteria unable to verify`,
        );
        return 'NEEDS_CHANGES';
      }

      // Some criteria explicitly not met
      if (unmetCriteria <= totalCriteria / 2) {
        this.logger.log(
          `Verdict: NEEDS_CHANGES - ${unmetCriteria}/${totalCriteria} acceptance criteria not met`,
        );
        return 'NEEDS_CHANGES';
      }
    }

    // === PASS ===
    this.logger.log('Verdict: PASS - all QA checks passed');
    return 'PASS';
  }

  /**
   * Build coverage analysis from test results and comparison.
   */
  private buildCoverageAnalysis(
    testResults: QATestResults,
    testComparison: QATestComparison,
  ): QACoverageAnalysis {
    const currentCoverage = testResults.coverage;
    const delta = testComparison.coverageDelta;

    // Calculate baseline coverage from current - delta
    let baselineCoverage: number | null = null;
    if (currentCoverage !== null && delta !== null) {
      baselineCoverage = currentCoverage - delta;
    }

    return {
      currentCoverage,
      baselineCoverage,
      delta,
      meetsThreshold:
        currentCoverage !== null && currentCoverage >= QA_COVERAGE_THRESHOLD,
    };
  }

  /**
   * Generate actionable comments based on check results.
   */
  private generateComments(
    params: QAReportBuildParams,
    coverageAnalysis: QACoverageAnalysis,
  ): string[] {
    const comments: string[] = [];

    // Test regressions
    if (params.testComparison.hasRegressions) {
      comments.push(
        `${params.testComparison.regressionCount} test regression(s) detected. Previously passing tests are now failing.`,
      );
    }

    // Failed tests
    if (params.testResults.failed > 0) {
      comments.push(
        `${params.testResults.failed} test(s) failing. Fix before merging.`,
      );
    }

    // Coverage
    if (!coverageAnalysis.meetsThreshold && coverageAnalysis.currentCoverage !== null) {
      comments.push(
        `Test coverage (${coverageAnalysis.currentCoverage}%) is below the ${QA_COVERAGE_THRESHOLD}% threshold. Write additional tests.`,
      );
    }

    // Security
    if (!params.securityScan.passed) {
      comments.push(
        `Critical/high security vulnerabilities found. Run \`npm audit fix\` or update affected dependencies.`,
      );
    }

    // Secrets
    if (params.secretScan.secretsFound) {
      const locations = params.secretScan.findings
        .map((f) => `${f.file}:${f.line} (${f.pattern})`)
        .join(', ');
      comments.push(
        `Hardcoded secrets detected: ${locations}. Move to environment variables.`,
      );
    }

    // Lint
    if (!params.lintResults.passed) {
      comments.push(
        `${params.lintResults.errors} lint error(s) found. Run \`npm run lint -- --fix\` to auto-fix.`,
      );
    }

    // Type check
    if (!params.typeCheckResults.passed) {
      comments.push(
        `${params.typeCheckResults.errors} TypeScript type error(s) found. Fix type issues.`,
      );
    }

    // Additional tests
    if (params.additionalTestsWritten > 0) {
      comments.push(
        `${params.additionalTestsWritten} additional test(s) written by QA Agent to improve coverage.`,
      );
    }

    return comments;
  }

  /**
   * Generate a human-readable summary.
   */
  private generateSummary(
    params: QAReportBuildParams,
    coverageAnalysis: QACoverageAnalysis,
  ): string {
    const parts: string[] = [];

    // Test results
    parts.push(
      `Tests: ${params.testResults.passed}/${params.testResults.total} passed`,
    );

    // Coverage
    if (coverageAnalysis.currentCoverage !== null) {
      parts.push(`Coverage: ${coverageAnalysis.currentCoverage}%`);
    }

    // Lint
    parts.push(
      params.lintResults.passed
        ? 'Lint: clean'
        : `Lint: ${params.lintResults.errors} error(s)`,
    );

    // Type check
    parts.push(
      params.typeCheckResults.passed
        ? 'Types: clean'
        : `Types: ${params.typeCheckResults.errors} error(s)`,
    );

    // Security
    parts.push(
      params.securityScan.passed
        ? 'Security: clean'
        : `Security: ${params.securityScan.critical} critical, ${params.securityScan.high} high`,
    );

    // Acceptance criteria
    const metCount = params.acceptanceCriteria.filter((c) => c.met).length;
    const totalCount = params.acceptanceCriteria.length;
    if (totalCount > 0) {
      parts.push(`Criteria: ${metCount}/${totalCount} met`);
    }

    return parts.join(' | ');
  }
}
