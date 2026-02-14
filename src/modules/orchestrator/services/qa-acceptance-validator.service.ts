/**
 * QAAcceptanceCriteriaValidatorService
 * Story 11.5: QA Agent CLI Integration
 *
 * Extracts acceptance criteria verification results from CLI session output.
 * Supports both structured checklist format and JSON format output.
 */
import { Injectable, Logger } from '@nestjs/common';
import { QAAcceptanceCriterionResult } from '../interfaces/qa-agent-execution.interfaces';

@Injectable()
export class QAAcceptanceCriteriaValidatorService {
  private readonly logger = new Logger(
    QAAcceptanceCriteriaValidatorService.name,
  );

  /**
   * Extract acceptance criteria verification from CLI output.
   * The CLI session is instructed to verify each criterion and report pass/fail.
   *
   * Supports formats:
   * 1. Markdown checklist: `- [x] criterion text - evidence`
   * 2. JSON block: QA_REPORT_JSON with acceptanceCriteria array
   *
   * @param cliOutput - Array of CLI output lines
   * @param acceptanceCriteria - List of acceptance criteria to verify
   * @returns Array of verification results per criterion
   */
  extractAcceptanceCriteriaResults(
    cliOutput: string[],
    acceptanceCriteria: string[],
  ): QAAcceptanceCriterionResult[] {
    if (acceptanceCriteria.length === 0) {
      return [];
    }

    const fullOutput = cliOutput.join('\n');

    // Try JSON format first (most structured)
    const jsonResults = this.tryParseJsonFormat(fullOutput, acceptanceCriteria);
    if (jsonResults) {
      return jsonResults;
    }

    // Try markdown checklist format
    const checklistResults = this.tryParseChecklistFormat(
      fullOutput,
      acceptanceCriteria,
    );
    if (checklistResults) {
      return checklistResults;
    }

    // Fallback: mark all as unable to verify
    return acceptanceCriteria.map((criterion) => ({
      criterion,
      met: false,
      evidence: 'Not explicitly verified in CLI output - unable to verify',
    }));
  }

  /**
   * Try to parse JSON format acceptance criteria from CLI output.
   * Looks for QA_REPORT_JSON block with acceptanceCriteria array.
   */
  private tryParseJsonFormat(
    fullOutput: string,
    acceptanceCriteria: string[],
  ): QAAcceptanceCriterionResult[] | null {
    // Look for QA_REPORT_JSON block
    const jsonMatch = fullOutput.match(
      /```QA_REPORT_JSON\s*\n([\s\S]*?)\n\s*```/,
    );
    if (!jsonMatch) {
      return null;
    }

    try {
      const report = JSON.parse(jsonMatch[1]);
      if (!Array.isArray(report.acceptanceCriteria)) {
        return null;
      }

      // Map the JSON results to our criteria list
      const results: QAAcceptanceCriterionResult[] = [];

      for (const criterion of acceptanceCriteria) {
        const jsonResult = report.acceptanceCriteria.find(
          (r: any) =>
            r.criterion &&
            (r.criterion === criterion ||
              criterion.includes(r.criterion) ||
              r.criterion.includes(criterion)),
        );

        if (jsonResult) {
          results.push({
            criterion,
            met: !!jsonResult.met,
            evidence: jsonResult.evidence || 'Verified via automated analysis',
          });
        } else {
          results.push({
            criterion,
            met: false,
            evidence: 'Not explicitly verified in CLI output - unable to verify',
          });
        }
      }

      return results;
    } catch {
      this.logger.warn('Failed to parse QA_REPORT_JSON block');
      return null;
    }
  }

  /**
   * Try to parse markdown checklist format.
   * Looks for patterns like:
   * - [x] criterion text - evidence (met)
   * - [ ] criterion text - evidence (not met)
   */
  private tryParseChecklistFormat(
    fullOutput: string,
    acceptanceCriteria: string[],
  ): QAAcceptanceCriterionResult[] | null {
    // Check if the output has checklist-style verification
    const hasChecklist =
      fullOutput.includes('- [x]') || fullOutput.includes('- [ ]');
    if (!hasChecklist) {
      return null;
    }

    const results: QAAcceptanceCriterionResult[] = [];
    let allMatched = true;

    for (const criterion of acceptanceCriteria) {
      const matched = this.findChecklistMatch(fullOutput, criterion);
      if (matched) {
        results.push(matched);
      } else {
        allMatched = false;
        results.push({
          criterion,
          met: false,
          evidence: 'Not explicitly verified in CLI output - unable to verify',
        });
      }
    }

    // Return results even if not all matched (partial matching is valid)
    return results;
  }

  /**
   * Find a checklist match for a specific criterion in the output.
   */
  private findChecklistMatch(
    output: string,
    criterion: string,
  ): QAAcceptanceCriterionResult | null {
    // Escape special regex characters in criterion text
    const escapedCriterion = criterion.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );

    // Try to find exact or partial match in checklist items
    // Pattern: - [x] or - [ ] followed by text containing the criterion
    const patterns = [
      // Exact match: - [x] criterion text - evidence
      new RegExp(
        `- \\[(x| )\\]\\s*(?:Criterion \\d+:\\s*)?${escapedCriterion}[^\\n]*`,
        'i',
      ),
      // Partial match: criterion text appears in a checklist line
      new RegExp(
        `- \\[(x| )\\][^\\n]*${escapedCriterion.substring(0, Math.min(escapedCriterion.length, 30))}[^\\n]*`,
        'i',
      ),
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        const isChecked = match[1] === 'x';
        const fullLine = match[0];

        // Extract evidence after the criterion text
        const evidenceSeparators = [' - ', ' -- ', ': '];
        let evidence = 'Verified via checklist';

        for (const sep of evidenceSeparators) {
          const sepIndex = fullLine.lastIndexOf(sep);
          if (sepIndex > 0) {
            const afterSep = fullLine.substring(sepIndex + sep.length).trim();
            if (afterSep.length > 5) {
              evidence = afterSep;
              break;
            }
          }
        }

        return {
          criterion,
          met: isChecked,
          evidence,
        };
      }
    }

    return null;
  }
}
