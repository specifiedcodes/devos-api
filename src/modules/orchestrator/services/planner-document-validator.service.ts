/**
 * PlannerDocumentValidatorService
 * Story 11.6: Planner Agent CLI Integration
 *
 * Validates and catalogues generated planning documents.
 * Checks that documents follow BMAD template format.
 * Validation is non-blocking - issues are reported but do not fail the pipeline.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  PlannerDocumentValidation,
  PlannerDocumentCheckResult,
  PlannerTaskType,
} from '../interfaces/planner-agent-execution.interfaces';

/** Pattern to match file creation/modification events in CLI output */
const FILE_PATH_PATTERNS = [
  /Created file:\s*(.+\.(?:md|yaml|yml))/gi,
  /Wrote to:\s*(.+\.(?:md|yaml|yml))/gi,
  /Modified:\s*(.+\.(?:md|yaml|yml))/gi,
  /(?:^|\s)((?:_bmad-output|src)\/[^\s]+\.(?:md|yaml|yml))/gm,
];

@Injectable()
export class PlannerDocumentValidatorService {
  private readonly logger = new Logger(PlannerDocumentValidatorService.name);

  /**
   * Validate and catalogue generated planning documents.
   * Scans workspace for newly created/modified planning documents
   * and validates each against BMAD template rules.
   *
   * @param workspacePath - Local workspace directory
   * @param planningTask - The type of planning task completed
   * @returns Validation result with document checks and issues
   */
  async validateDocuments(
    workspacePath: string,
    planningTask: PlannerTaskType,
  ): Promise<PlannerDocumentValidation> {
    const issues: string[] = [];
    const documents: PlannerDocumentCheckResult[] = [];

    try {
      // Scan for planning documents in expected directories
      const planningPaths = [
        path.join(workspacePath, '_bmad-output', 'planning-artifacts'),
        path.join(workspacePath, '_bmad-output', 'implementation-artifacts'),
      ];

      const filePaths: string[] = [];
      for (const dir of planningPaths) {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter(
            (f) => f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml'),
          );
          filePaths.push(...files.map((f) => path.join(dir, f)));
        }
      }

      // Also scan epics subdirectory
      const epicsDir = path.join(
        workspacePath,
        '_bmad-output',
        'planning-artifacts',
        'epics',
      );
      if (fs.existsSync(epicsDir)) {
        const epicFiles = fs.readdirSync(epicsDir).filter((f) => f.endsWith('.md'));
        filePaths.push(...epicFiles.map((f) => path.join(epicsDir, f)));
      }

      // Validate each document
      for (const filePath of filePaths) {
        const documentType = this.inferDocumentType(filePath);
        const result = await this.validateDocument(filePath, documentType);
        documents.push(result);
        if (!result.valid) {
          issues.push(...result.issues.map((issue) => `${path.basename(filePath)}: ${issue}`));
        }
      }

      const validDocuments = documents.filter((d) => d.valid).length;

      return {
        valid: issues.length === 0,
        documents,
        totalDocuments: documents.length,
        validDocuments,
        issues,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Document validation failed: ${errorMessage}`);

      return {
        valid: false,
        documents,
        totalDocuments: 0,
        validDocuments: 0,
        issues: [`Validation error: ${errorMessage}`],
      };
    }
  }

  /**
   * Extract generated document paths from CLI output.
   * Parses CLI output for file creation/modification events.
   *
   * @param cliOutput - Array of CLI output lines
   * @returns Deduplicated list of file paths
   */
  extractDocumentPaths(cliOutput: string[]): string[] {
    const allOutput = cliOutput.join('\n');
    const paths = new Set<string>();

    for (const pattern of FILE_PATH_PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(allOutput)) !== null) {
        const filePath = match[1].trim();
        if (filePath) {
          paths.add(filePath);
        }
      }
    }

    return Array.from(paths);
  }

  /**
   * Validate a single document follows BMAD template conventions.
   * Checks for required sections, acceptance criteria format, etc.
   *
   * @param filePath - Path to the document file
   * @param documentType - Type of document (epic, story, prd, architecture, sprint-status)
   * @returns Validation result with issues list
   */
  async validateDocument(
    filePath: string,
    documentType: string,
  ): Promise<PlannerDocumentCheckResult> {
    const result: PlannerDocumentCheckResult = {
      filePath,
      documentType,
      valid: true,
      hasAcceptanceCriteria: false,
      hasTaskBreakdown: false,
      issues: [],
    };

    try {
      if (!fs.existsSync(filePath)) {
        result.valid = false;
        result.issues.push('File not found');
        return result;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      switch (documentType) {
        case 'epic':
          this.validateEpicDocument(content, result);
          break;
        case 'story':
          this.validateStoryDocument(content, result);
          break;
        case 'prd':
          this.validatePrdDocument(content, result);
          break;
        case 'architecture':
          this.validateArchitectureDocument(content, result);
          break;
        case 'sprint-status':
          this.validateSprintStatusDocument(content, result);
          break;
        default:
          // Unknown document type - skip validation
          break;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.valid = false;
      result.issues.push(`Read error: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Validate an epic document has required sections.
   */
  private validateEpicDocument(
    content: string,
    result: PlannerDocumentCheckResult,
  ): void {
    // Check for title (# heading)
    if (!/^#\s+.+/m.test(content)) {
      result.issues.push('Missing title (# heading)');
      result.valid = false;
    }

    // Check for story stubs or story list
    if (
      !content.toLowerCase().includes('story') &&
      !content.toLowerCase().includes('stories')
    ) {
      result.issues.push('Missing story stubs or story list');
      result.valid = false;
    }

    // Check for description section
    if (
      !content.toLowerCase().includes('description') &&
      !content.toLowerCase().includes('overview')
    ) {
      result.issues.push('Missing description or overview section');
      result.valid = false;
    }
  }

  /**
   * Validate a story document has acceptance criteria and task breakdown.
   */
  private validateStoryDocument(
    content: string,
    result: PlannerDocumentCheckResult,
  ): void {
    const lowerContent = content.toLowerCase();

    // Check for acceptance criteria
    if (
      lowerContent.includes('acceptance criteria') ||
      lowerContent.includes('given') ||
      /\d+\.\s+/.test(content)
    ) {
      result.hasAcceptanceCriteria = true;
    } else {
      result.issues.push('Missing acceptance criteria section');
      result.valid = false;
    }

    // Check for tasks/subtasks
    if (
      lowerContent.includes('task') ||
      lowerContent.includes('subtask') ||
      lowerContent.includes('- [ ]')
    ) {
      result.hasTaskBreakdown = true;
    } else {
      result.issues.push('Missing tasks/subtasks section');
      result.valid = false;
    }
  }

  /**
   * Validate a PRD document has required sections.
   */
  private validatePrdDocument(
    content: string,
    result: PlannerDocumentCheckResult,
  ): void {
    const lowerContent = content.toLowerCase();

    if (!lowerContent.includes('overview')) {
      result.issues.push('Missing overview section');
      result.valid = false;
    }

    if (!lowerContent.includes('problem statement') && !lowerContent.includes('problem')) {
      result.issues.push('Missing problem statement section');
      result.valid = false;
    }

    if (!lowerContent.includes('requirements') && !lowerContent.includes('requirement')) {
      result.issues.push('Missing requirements section');
      result.valid = false;
    }
  }

  /**
   * Validate an architecture document has required sections.
   */
  private validateArchitectureDocument(
    content: string,
    result: PlannerDocumentCheckResult,
  ): void {
    const lowerContent = content.toLowerCase();

    if (!lowerContent.includes('tech stack') && !lowerContent.includes('technology')) {
      result.issues.push('Missing tech stack section');
      result.valid = false;
    }

    if (!lowerContent.includes('component')) {
      result.issues.push('Missing components section');
      result.valid = false;
    }

    if (!lowerContent.includes('data model') && !lowerContent.includes('database')) {
      result.issues.push('Missing data model section');
      result.valid = false;
    }
  }

  /**
   * Validate sprint-status.yaml is valid YAML.
   */
  private validateSprintStatusDocument(
    content: string,
    result: PlannerDocumentCheckResult,
  ): void {
    try {
      // Basic YAML structure check - should have key: value pairs
      if (!content.includes(':')) {
        result.issues.push('Invalid YAML: missing key-value pairs');
        result.valid = false;
        return;
      }

      // Check for development_status section
      if (!content.includes('development_status')) {
        result.issues.push('Missing development_status section');
        result.valid = false;
      }
    } catch {
      result.issues.push('YAML validation failed');
      result.valid = false;
    }
  }

  /**
   * Infer document type from file path.
   */
  private inferDocumentType(filePath: string): string {
    const basename = path.basename(filePath).toLowerCase();
    const dirname = path.dirname(filePath).toLowerCase();

    if (basename.endsWith('.yaml') || basename.endsWith('.yml')) {
      if (basename.includes('sprint-status')) {
        return 'sprint-status';
      }
      return 'unknown';
    }

    if (dirname.includes('epics') || basename.startsWith('epic-')) {
      return 'epic';
    }

    if (basename.includes('prd') || basename.includes('product-requirement')) {
      return 'prd';
    }

    if (basename.includes('architecture') || basename.includes('arch')) {
      return 'architecture';
    }

    if (basename.includes('product-brief')) {
      return 'product-brief';
    }

    // Default: if in implementation-artifacts and has number prefix, it's a story
    if (dirname.includes('implementation-artifacts') && /^\d+-\d+/.test(basename)) {
      return 'story';
    }

    return 'unknown';
  }
}
