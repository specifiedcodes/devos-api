/**
 * QAAcceptanceCriteriaValidatorService Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * Tests for acceptance criteria extraction from CLI output.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { QAAcceptanceCriteriaValidatorService } from './qa-acceptance-validator.service';

describe('QAAcceptanceCriteriaValidatorService', () => {
  let service: QAAcceptanceCriteriaValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QAAcceptanceCriteriaValidatorService],
    }).compile();

    service = module.get<QAAcceptanceCriteriaValidatorService>(
      QAAcceptanceCriteriaValidatorService,
    );
  });

  describe('extractAcceptanceCriteriaResults', () => {
    it('should parse structured criteria results from CLI output', () => {
      const cliOutput = [
        '## Acceptance Criteria Verification',
        '- [x] Criterion 1: Tests pass with 80% coverage - VERIFIED: coverage is 85%',
        '- [x] Criterion 2: Lint checks pass - VERIFIED: zero lint errors',
        '- [ ] Criterion 3: Security scan clean - NOT MET: 2 high vulnerabilities',
      ];

      const criteria = [
        'Tests pass with 80% coverage',
        'Lint checks pass',
        'Security scan clean',
      ];

      const results = service.extractAcceptanceCriteriaResults(cliOutput, criteria);

      expect(results).toHaveLength(3);
      expect(results[0].met).toBe(true);
      expect(results[1].met).toBe(true);
      expect(results[2].met).toBe(false);
    });

    it('should mark all criteria as met when all verified', () => {
      const cliOutput = [
        '- [x] Tests pass with 80% coverage - VERIFIED',
        '- [x] API endpoints return correct responses - VERIFIED',
      ];

      const criteria = [
        'Tests pass with 80% coverage',
        'API endpoints return correct responses',
      ];

      const results = service.extractAcceptanceCriteriaResults(cliOutput, criteria);

      expect(results.every((r) => r.met)).toBe(true);
    });

    it('should mark unverifiable criteria as "unable to verify"', () => {
      const cliOutput = [
        'Some random output',
        'No structured criteria verification here',
      ];

      const criteria = [
        'Database migrations run successfully',
        'WebSocket events fire correctly',
      ];

      const results = service.extractAcceptanceCriteriaResults(cliOutput, criteria);

      expect(results).toHaveLength(2);
      expect(results[0].met).toBe(false);
      expect(results[0].evidence).toContain('unable to verify');
    });

    it('should handle empty CLI output gracefully', () => {
      const criteria = ['Tests pass', 'Lint passes'];

      const results = service.extractAcceptanceCriteriaResults([], criteria);

      expect(results).toHaveLength(2);
      expect(results.every((r) => !r.met)).toBe(true);
      expect(results.every((r) => r.evidence.includes('unable to verify'))).toBe(true);
    });

    it('should handle empty acceptance criteria list', () => {
      const cliOutput = ['Some output'];

      const results = service.extractAcceptanceCriteriaResults(cliOutput, []);

      expect(results).toHaveLength(0);
    });

    it('should parse JSON format criteria results', () => {
      const cliOutput = [
        '```QA_REPORT_JSON',
        JSON.stringify({
          acceptanceCriteria: [
            { criterion: 'Tests pass', met: true, evidence: 'All 50 tests pass' },
            { criterion: 'Coverage >= 80%', met: true, evidence: 'Coverage is 92%' },
          ],
        }),
        '```',
      ];

      const criteria = ['Tests pass', 'Coverage >= 80%'];

      const results = service.extractAcceptanceCriteriaResults(cliOutput, criteria);

      expect(results).toHaveLength(2);
      expect(results[0].met).toBe(true);
      expect(results[0].evidence).toContain('50 tests pass');
    });

    it('should handle partial matching of criteria text', () => {
      const cliOutput = [
        '- [x] Tests pass with coverage - Tests are passing with 85% coverage',
      ];

      const criteria = ['Tests pass with coverage'];

      const results = service.extractAcceptanceCriteriaResults(cliOutput, criteria);

      expect(results).toHaveLength(1);
      expect(results[0].met).toBe(true);
    });
  });
});
