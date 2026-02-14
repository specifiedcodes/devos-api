/**
 * QAReportGeneratorService Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * Tests for QA report building and verdict determination.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { QAReportGeneratorService } from './qa-report-generator.service';
import {
  QATestResults,
  QATestComparison,
  QALintResults,
  QATypeCheckResults,
  QASecurityScan,
  QASecretScanResult,
  QAAcceptanceCriterionResult,
  QAReport,
} from '../interfaces/qa-agent-execution.interfaces';

describe('QAReportGeneratorService', () => {
  let service: QAReportGeneratorService;

  const passingTestResults: QATestResults = {
    total: 50, passed: 50, failed: 0, skipped: 0,
    coverage: 85, testCommand: 'npm test', failedTests: [],
  };

  const passingComparison: QATestComparison = {
    totalDelta: 5, passedDelta: 5, failedDelta: 0,
    coverageDelta: 2, hasRegressions: false, regressionCount: 0,
  };

  const passingLintResults: QALintResults = {
    errors: 0, warnings: 2, fixableErrors: 0, fixableWarnings: 1,
    passed: true, details: 'Clean lint',
  };

  const passingTypeCheckResults: QATypeCheckResults = {
    errors: 0, passed: true, details: 'No type errors',
  };

  const passingSecurityScan: QASecurityScan = {
    critical: 0, high: 0, medium: 1, low: 2, total: 3,
    passed: true, details: 'No critical issues',
  };

  const cleanSecretScan: QASecretScanResult = {
    secretsFound: false, findings: [],
  };

  const allCriteriaMet: QAAcceptanceCriterionResult[] = [
    { criterion: 'Tests pass', met: true, evidence: 'All 50 tests pass' },
    { criterion: 'Coverage >= 80%', met: true, evidence: 'Coverage is 85%' },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QAReportGeneratorService],
    }).compile();

    service = module.get<QAReportGeneratorService>(QAReportGeneratorService);
  });

  describe('buildReport', () => {
    it('should build complete QA report with all sections', () => {
      const report = service.buildReport({
        storyId: '11-5',
        testResults: passingTestResults,
        testComparison: passingComparison,
        lintResults: passingLintResults,
        typeCheckResults: passingTypeCheckResults,
        securityScan: passingSecurityScan,
        secretScan: cleanSecretScan,
        acceptanceCriteria: allCriteriaMet,
        additionalTestsWritten: 3,
      });

      expect(report.storyId).toBe('11-5');
      expect(report.testResults).toEqual(passingTestResults);
      expect(report.lintResults).toEqual(passingLintResults);
      expect(report.typeCheckResults).toEqual(passingTypeCheckResults);
      expect(report.securityScan).toEqual(passingSecurityScan);
      expect(report.acceptanceCriteria).toEqual(allCriteriaMet);
      expect(report.summary).toBeDefined();
      expect(report.summary.length).toBeGreaterThan(0);
    });

    it('should include test comparison with baseline', () => {
      const report = service.buildReport({
        storyId: '11-5',
        testResults: passingTestResults,
        testComparison: passingComparison,
        lintResults: passingLintResults,
        typeCheckResults: passingTypeCheckResults,
        securityScan: passingSecurityScan,
        secretScan: cleanSecretScan,
        acceptanceCriteria: allCriteriaMet,
        additionalTestsWritten: 0,
      });

      expect(report.coverageAnalysis.currentCoverage).toBe(85);
      expect(report.coverageAnalysis.delta).toBe(2);
      expect(report.coverageAnalysis.meetsThreshold).toBe(true);
    });
  });

  describe('determineVerdict', () => {
    it('should return PASS when all checks pass', () => {
      const report = service.buildReport({
        storyId: '11-5',
        testResults: passingTestResults,
        testComparison: passingComparison,
        lintResults: passingLintResults,
        typeCheckResults: passingTypeCheckResults,
        securityScan: passingSecurityScan,
        secretScan: cleanSecretScan,
        acceptanceCriteria: allCriteriaMet,
        additionalTestsWritten: 0,
      });

      expect(report.verdict).toBe('PASS');
    });

    it('should return FAIL when tests have regressions', () => {
      const regressionComparison: QATestComparison = {
        ...passingComparison,
        hasRegressions: true,
        regressionCount: 3,
        failedDelta: 3,
      };
      const failingTests: QATestResults = {
        ...passingTestResults,
        failed: 3,
        passed: 47,
      };

      const report = service.buildReport({
        storyId: '11-5',
        testResults: failingTests,
        testComparison: regressionComparison,
        lintResults: passingLintResults,
        typeCheckResults: passingTypeCheckResults,
        securityScan: passingSecurityScan,
        secretScan: cleanSecretScan,
        acceptanceCriteria: allCriteriaMet,
        additionalTestsWritten: 0,
      });

      expect(report.verdict).toBe('FAIL');
    });

    it('should return FAIL when critical security issues found', () => {
      const criticalSecurity: QASecurityScan = {
        critical: 1, high: 2, medium: 0, low: 0, total: 3,
        passed: false, details: 'Critical vulnerability',
      };

      const report = service.buildReport({
        storyId: '11-5',
        testResults: passingTestResults,
        testComparison: passingComparison,
        lintResults: passingLintResults,
        typeCheckResults: passingTypeCheckResults,
        securityScan: criticalSecurity,
        secretScan: cleanSecretScan,
        acceptanceCriteria: allCriteriaMet,
        additionalTestsWritten: 0,
      });

      expect(report.verdict).toBe('FAIL');
    });

    it('should return FAIL when secrets detected', () => {
      const secretsFound: QASecretScanResult = {
        secretsFound: true,
        findings: [{ file: 'src/config.ts', line: 5, pattern: 'API_KEY' }],
      };

      const report = service.buildReport({
        storyId: '11-5',
        testResults: passingTestResults,
        testComparison: passingComparison,
        lintResults: passingLintResults,
        typeCheckResults: passingTypeCheckResults,
        securityScan: passingSecurityScan,
        secretScan: secretsFound,
        acceptanceCriteria: allCriteriaMet,
        additionalTestsWritten: 0,
      });

      expect(report.verdict).toBe('FAIL');
    });

    it('should return NEEDS_CHANGES for minor issues', () => {
      const lowCoverage: QATestResults = {
        ...passingTestResults,
        coverage: 75,
      };

      const report = service.buildReport({
        storyId: '11-5',
        testResults: lowCoverage,
        testComparison: { ...passingComparison, coverageDelta: -10 },
        lintResults: passingLintResults,
        typeCheckResults: passingTypeCheckResults,
        securityScan: passingSecurityScan,
        secretScan: cleanSecretScan,
        acceptanceCriteria: allCriteriaMet,
        additionalTestsWritten: 0,
      });

      expect(report.verdict).toBe('NEEDS_CHANGES');
    });

    it('should return FAIL when multiple acceptance criteria not met', () => {
      const criteriaMostlyFailed: QAAcceptanceCriterionResult[] = [
        { criterion: 'Tests pass', met: false, evidence: 'Tests failing' },
        { criterion: 'Coverage >= 80%', met: false, evidence: 'Only 50%' },
        { criterion: 'Lint clean', met: true, evidence: 'Clean' },
      ];

      const report = service.buildReport({
        storyId: '11-5',
        testResults: passingTestResults,
        testComparison: passingComparison,
        lintResults: passingLintResults,
        typeCheckResults: passingTypeCheckResults,
        securityScan: passingSecurityScan,
        secretScan: cleanSecretScan,
        acceptanceCriteria: criteriaMostlyFailed,
        additionalTestsWritten: 0,
      });

      expect(report.verdict).toBe('FAIL');
    });

    it('should return NEEDS_CHANGES when single acceptance criterion unclear', () => {
      const oneCriterionFailed: QAAcceptanceCriterionResult[] = [
        { criterion: 'Tests pass', met: true, evidence: 'All pass' },
        { criterion: 'Coverage >= 80%', met: true, evidence: '85%' },
        { criterion: 'Docs updated', met: false, evidence: 'Unable to verify' },
      ];

      const report = service.buildReport({
        storyId: '11-5',
        testResults: passingTestResults,
        testComparison: passingComparison,
        lintResults: passingLintResults,
        typeCheckResults: passingTypeCheckResults,
        securityScan: passingSecurityScan,
        secretScan: cleanSecretScan,
        acceptanceCriteria: oneCriterionFailed,
        additionalTestsWritten: 0,
      });

      // Single criterion not met with "unable to verify" -> NEEDS_CHANGES
      expect(report.verdict).toBe('NEEDS_CHANGES');
    });
  });
});
