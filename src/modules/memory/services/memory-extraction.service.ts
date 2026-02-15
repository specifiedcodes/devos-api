/**
 * MemoryExtractionService
 * Story 12.2: Memory Ingestion Pipeline
 *
 * Extracts structured memory episodes from pipeline task output data.
 * Uses a stub/deterministic implementation that parses structured metadata
 * (commit messages, file paths, error messages, test results) rather than
 * calling an external LLM API. LLM-based extraction will be added when
 * multi-model routing (Epic 13) is available.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExtractedMemory,
  IngestionInput,
  MemoryEpisodeType,
} from '../interfaces/memory.interfaces';

/** Maximum episodes extracted from a single ingestion run */
const DEFAULT_MAX_EPISODES = 20;

/** Keywords that indicate a decision was made */
const DECISION_KEYWORDS = [
  'chose',
  'decided',
  'selected',
  'switched to',
  'using',
  'adopted',
  'migrated to',
  'replaced',
  'prefer',
  'picked',
];

/** Keywords that indicate a problem was encountered/solved */
const PROBLEM_KEYWORDS = [
  'fixed',
  'resolved',
  'bug',
  'error',
  'failure',
  'crash',
  'workaround',
  'issue',
  'patch',
  'hotfix',
];

@Injectable()
export class MemoryExtractionService {
  private readonly logger = new Logger(MemoryExtractionService.name);
  private readonly maxEpisodes: number;

  constructor(private readonly configService: ConfigService) {
    this.maxEpisodes = DEFAULT_MAX_EPISODES;
  }

  /**
   * Extract memory episodes from pipeline task output data.
   * This stub implementation parses structured fields rather than using LLM.
   *
   * @param input - Ingestion input with task output metadata
   * @returns Array of ExtractedMemory objects ready for storage
   */
  extract(input: IngestionInput): ExtractedMemory[] {
    const memories: ExtractedMemory[] = [];

    // Extract decisions from commit messages
    this.extractDecisions(input, memories);

    // Extract facts from file paths and metadata
    this.extractFacts(input, memories);

    // Extract problems from errors and test failures
    this.extractProblems(input, memories);

    // Extract preferences from naming patterns
    this.extractPreferences(input, memories);

    // Extract patterns from metadata
    this.extractPatterns(input, memories);

    // Limit to max episodes
    return memories.slice(0, this.maxEpisodes);
  }

  /**
   * Extract decision memories from commit messages containing decision keywords.
   * Confidence: 0.9 for explicit decisions in commit messages.
   */
  private extractDecisions(
    input: IngestionInput,
    memories: ExtractedMemory[],
  ): void {
    if (!input.commitMessages || input.commitMessages.length === 0) {
      return;
    }

    for (const message of input.commitMessages) {
      const lowerMessage = message.toLowerCase();
      const matchedKeyword = DECISION_KEYWORDS.find((kw) =>
        lowerMessage.includes(kw),
      );

      if (matchedKeyword) {
        const entities = this.extractEntitiesFromText(message);
        memories.push({
          episodeType: 'decision',
          content: `Decision: ${message}`,
          entities,
          confidence: 0.9,
          metadata: {
            source: 'commit_message',
            keyword: matchedKeyword,
            agentType: input.agentType,
          },
        });
      }
    }
  }

  /**
   * Extract fact memories from file paths, API endpoints, and deployments.
   * Confidence: 0.8 for file-based facts.
   */
  private extractFacts(
    input: IngestionInput,
    memories: ExtractedMemory[],
  ): void {
    // Facts from file paths
    if (input.filesChanged && input.filesChanged.length > 0) {
      // Group files by directory to create meaningful facts
      const apiFiles = input.filesChanged.filter(
        (f) =>
          f.includes('/controllers/') ||
          f.includes('/api/') ||
          f.includes('.controller.'),
      );
      const entityFiles = input.filesChanged.filter(
        (f) =>
          f.includes('/entities/') ||
          f.includes('.entity.') ||
          f.includes('/models/'),
      );
      const serviceFiles = input.filesChanged.filter(
        (f) => f.includes('/services/') || f.includes('.service.'),
      );

      if (apiFiles.length > 0) {
        const endpoints = apiFiles.map((f) => this.extractServiceName(f));
        memories.push({
          episodeType: 'fact',
          content: `Created or modified API endpoints: ${endpoints.join(', ')}`,
          entities: apiFiles.map((f) => this.normalizeFilePath(f)),
          confidence: 0.8,
          metadata: {
            source: 'file_paths',
            category: 'api',
            fileCount: apiFiles.length,
            agentType: input.agentType,
          },
        });
      }

      if (entityFiles.length > 0) {
        const entities = entityFiles.map((f) => this.extractServiceName(f));
        memories.push({
          episodeType: 'fact',
          content: `Created or modified database entities: ${entities.join(', ')}`,
          entities: entityFiles.map((f) => this.normalizeFilePath(f)),
          confidence: 0.8,
          metadata: {
            source: 'file_paths',
            category: 'entity',
            fileCount: entityFiles.length,
            agentType: input.agentType,
          },
        });
      }

      if (serviceFiles.length > 0) {
        const services = serviceFiles.map((f) => this.extractServiceName(f));
        memories.push({
          episodeType: 'fact',
          content: `Created or modified services: ${services.join(', ')}`,
          entities: serviceFiles.map((f) => this.normalizeFilePath(f)),
          confidence: 0.8,
          metadata: {
            source: 'file_paths',
            category: 'service',
            fileCount: serviceFiles.length,
            agentType: input.agentType,
          },
        });
      }
    }

    // Facts from deployment URL
    if (input.deploymentUrl) {
      memories.push({
        episodeType: 'fact',
        content: `Deployed to: ${input.deploymentUrl}`,
        entities: ['deployment'],
        confidence: 0.8,
        metadata: {
          source: 'deployment',
          url: input.deploymentUrl,
          agentType: input.agentType,
        },
      });
    }

    // Facts from PR URL
    if (input.prUrl) {
      memories.push({
        episodeType: 'fact',
        content: `Pull request created: ${input.prUrl}`,
        entities: ['pull-request'],
        confidence: 0.8,
        metadata: {
          source: 'pull_request',
          url: input.prUrl,
          agentType: input.agentType,
        },
      });
    }

    // Facts from branch
    if (input.branch) {
      memories.push({
        episodeType: 'fact',
        content: `Work done on branch: ${input.branch}`,
        entities: [input.branch],
        confidence: 0.8,
        metadata: {
          source: 'branch',
          branch: input.branch,
          commitHash: input.commitHash,
          agentType: input.agentType,
        },
      });
    }
  }

  /**
   * Extract problem memories from error messages and failed tests.
   * Confidence: 0.7 for error/problem resolution.
   */
  private extractProblems(
    input: IngestionInput,
    memories: ExtractedMemory[],
  ): void {
    // Problems from error messages
    if (input.errorMessage) {
      const entities = this.extractEntitiesFromText(input.errorMessage);
      memories.push({
        episodeType: 'problem',
        content: `Error encountered: ${input.errorMessage}`,
        entities,
        confidence: 0.7,
        metadata: {
          source: 'error_message',
          exitCode: input.exitCode,
          agentType: input.agentType,
        },
      });
    }

    // Problems from failed tests
    if (input.testResults && input.testResults.failed > 0) {
      memories.push({
        episodeType: 'problem',
        content: `Test failures detected: ${input.testResults.failed} of ${input.testResults.total} tests failed`,
        entities: ['tests'],
        confidence: 0.7,
        metadata: {
          source: 'test_results',
          passed: input.testResults.passed,
          failed: input.testResults.failed,
          total: input.testResults.total,
          agentType: input.agentType,
        },
      });
    }

    // Problems from commit messages
    if (input.commitMessages && input.commitMessages.length > 0) {
      for (const message of input.commitMessages) {
        const lowerMessage = message.toLowerCase();
        const matchedKeyword = PROBLEM_KEYWORDS.find((kw) =>
          lowerMessage.includes(kw),
        );

        if (matchedKeyword) {
          // Skip if already handled as a decision
          const isAlsoDecision = DECISION_KEYWORDS.some((kw) =>
            lowerMessage.includes(kw),
          );
          if (isAlsoDecision) continue;

          const entities = this.extractEntitiesFromText(message);
          memories.push({
            episodeType: 'problem',
            content: `Problem resolved: ${message}`,
            entities,
            confidence: 0.7,
            metadata: {
              source: 'commit_message',
              keyword: matchedKeyword,
              agentType: input.agentType,
            },
          });
        }
      }
    }
  }

  /**
   * Extract preference memories from file naming patterns and test patterns.
   * Confidence: 0.5 for inferred preferences.
   */
  private extractPreferences(
    input: IngestionInput,
    memories: ExtractedMemory[],
  ): void {
    if (!input.filesChanged || input.filesChanged.length === 0) {
      return;
    }

    // Detect testing approach preference
    const testFiles = input.filesChanged.filter(
      (f) =>
        f.includes('.spec.') ||
        f.includes('.test.') ||
        f.includes('__tests__'),
    );

    if (testFiles.length > 0) {
      const specFiles = testFiles.filter((f) => f.includes('.spec.'));
      const testFilesSuffix = testFiles.filter((f) => f.includes('.test.'));

      const convention =
        specFiles.length > testFilesSuffix.length ? '.spec.' : '.test.';
      memories.push({
        episodeType: 'preference',
        content: `Testing convention: Uses ${convention} file suffix for test files (${testFiles.length} test files)`,
        entities: testFiles.map((f) => this.normalizeFilePath(f)),
        confidence: 0.5,
        metadata: {
          source: 'file_naming',
          convention,
          testFileCount: testFiles.length,
          agentType: input.agentType,
        },
      });
    }

    // Detect file naming convention (kebab-case, camelCase, etc.)
    const srcFiles = input.filesChanged.filter(
      (f) =>
        !f.includes('node_modules') &&
        !f.includes('.spec.') &&
        !f.includes('.test.'),
    );
    const kebabCase = srcFiles.filter((f) => {
      const name = f.split('/').pop() || '';
      return name.includes('-') && !name.startsWith('.');
    });

    if (kebabCase.length > srcFiles.length / 2 && srcFiles.length >= 3) {
      memories.push({
        episodeType: 'preference',
        content: `File naming convention: Uses kebab-case for file names`,
        entities: [],
        confidence: 0.5,
        metadata: {
          source: 'file_naming',
          convention: 'kebab-case',
          sampleSize: srcFiles.length,
          agentType: input.agentType,
        },
      });
    }
  }

  /**
   * Extract pattern memories from repeated approaches and metadata.
   * Confidence: 0.6 for patterns from metadata.
   */
  private extractPatterns(
    input: IngestionInput,
    memories: ExtractedMemory[],
  ): void {
    // Pattern from test results (consistent testing approach)
    if (
      input.testResults &&
      input.testResults.total > 0 &&
      input.testResults.failed === 0
    ) {
      memories.push({
        episodeType: 'pattern',
        content: `All ${input.testResults.total} tests passed for ${input.agentType} agent task`,
        entities: ['tests', input.agentType],
        confidence: 0.6,
        metadata: {
          source: 'test_results',
          passed: input.testResults.passed,
          total: input.testResults.total,
          agentType: input.agentType,
        },
      });
    }

    // Pattern from successful task completion
    if (input.exitCode === 0 && input.durationMs > 0) {
      memories.push({
        episodeType: 'pattern',
        content: `${input.agentType} agent task completed successfully in ${Math.round(input.durationMs / 1000)}s`,
        entities: [input.agentType],
        confidence: 0.6,
        metadata: {
          source: 'task_completion',
          durationMs: input.durationMs,
          exitCode: input.exitCode,
          agentType: input.agentType,
        },
      });
    }

    // Pattern from pipeline metadata (detect reusable approaches)
    if (
      input.pipelineMetadata &&
      typeof input.pipelineMetadata === 'object' &&
      Object.keys(input.pipelineMetadata).length > 0
    ) {
      const techStack = input.pipelineMetadata.techStack;
      if (techStack && typeof techStack === 'string') {
        memories.push({
          episodeType: 'pattern',
          content: `Project uses tech stack: ${techStack}`,
          entities: techStack.split(',').map((t: string) => t.trim()),
          confidence: 0.6,
          metadata: {
            source: 'pipeline_metadata',
            techStack,
            agentType: input.agentType,
          },
        });
      }
    }
  }

  /**
   * Extract entity references from a text string.
   * Identifies file paths, library names, and API endpoints.
   */
  private extractEntitiesFromText(text: string): string[] {
    const entities: string[] = [];

    // Extract file paths
    const filePathRegex = /[\w-]+\.[\w]+/g;
    const filePaths = text.match(filePathRegex);
    if (filePaths) {
      entities.push(
        ...filePaths.filter(
          (fp) =>
            !fp.match(/^\d+\.\d+$/) && // Exclude version numbers
            fp.length > 3,
        ),
      );
    }

    // Extract npm package / library names (e.g., "NestJS", "TypeORM", "BullMQ")
    // Match capitalized words that look like tech names: must contain mixed casing
    // (internal uppercase after lowercase, or digits within word)
    const libraryRegex = /\b([A-Z][a-zA-Z0-9]+)\b/g;
    const libraries = text.match(libraryRegex);
    const commonWords = new Set([
      'The', 'This', 'That', 'When', 'Then', 'Given',
      'But', 'And', 'For', 'Not', 'All', 'Any', 'Has',
      'Was', 'Are', 'Were', 'Had', 'Did', 'Does', 'May',
      'Can', 'Will', 'Its', 'Use', 'Used', 'Using',
      'New', 'Old', 'Set', 'Get', 'Put', 'Run', 'Add',
      'Decided', 'Selected', 'Chose', 'Fixed', 'Created',
      'Updated', 'Removed', 'Added', 'Moved', 'Changed',
      'Error', 'Problem', 'Issue', 'Failed', 'Success',
      'Test', 'Tests', 'Task', 'Work', 'Done', 'With',
      'From', 'Into', 'Over', 'Each', 'Some', 'Every',
      'Connection', 'Migration', 'Column', 'Table',
      'Deployed', 'Resolved', 'Applied', 'Replaced',
      'Decision', 'Memory', 'Fact', 'Pattern', 'Preference',
      'Pull', 'Request', 'Branch', 'Commit', 'Session',
    ]);
    if (libraries) {
      entities.push(
        ...libraries.filter(
          (lib) =>
            lib.length > 2 &&
            !commonWords.has(lib) &&
            // Must contain at least one internal capital or digit (tech name heuristic)
            (/[a-z][A-Z]/.test(lib) || /[A-Z]{2,}/.test(lib) || /\d/.test(lib)),
        ),
      );
    }

    // Extract API endpoints
    const apiRegex = /\/api\/[\w/.-]+/g;
    const apiEndpoints = text.match(apiRegex);
    if (apiEndpoints) {
      entities.push(...apiEndpoints);
    }

    // Deduplicate
    return [...new Set(entities)];
  }

  /**
   * Extract a service/controller name from a file path.
   */
  private extractServiceName(filePath: string): string {
    const fileName = filePath.split('/').pop() || filePath;
    return fileName.replace(/\.(spec\.ts|test\.ts|spec\.js|test\.js|ts|js)$/, '');
  }

  /**
   * Normalize a file path for use as an entity reference.
   */
  private normalizeFilePath(filePath: string): string {
    // Remove leading src/ or similar prefixes for cleaner entity names
    return filePath
      .replace(/^.*?src\//, 'src/')
      .replace(/^\.\//, '');
  }
}
