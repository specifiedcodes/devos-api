/**
 * MemoryExtractionService Unit Tests
 * Story 12.2: Memory Ingestion Pipeline
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MemoryExtractionService } from './memory-extraction.service';
import { IngestionInput } from '../interfaces/memory.interfaces';

describe('MemoryExtractionService', () => {
  let service: MemoryExtractionService;
  let mockConfigService: any;

  const createInput = (
    overrides: Partial<IngestionInput> = {},
  ): IngestionInput => ({
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    agentType: 'dev',
    sessionId: 'session-1',
    branch: 'feature/memory-ingestion',
    commitHash: 'abc123',
    exitCode: 0,
    durationMs: 30000,
    outputSummary: null,
    filesChanged: [],
    commitMessages: [],
    testResults: null,
    prUrl: null,
    deploymentUrl: null,
    errorMessage: null,
    pipelineMetadata: {},
    ...overrides,
  });

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MEMORY_EXTRACTION_MODEL') return 'stub';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryExtractionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MemoryExtractionService>(MemoryExtractionService);
  });

  describe('extract', () => {
    describe('Decision extraction', () => {
      it('should extract decision from commit message containing "decided"', () => {
        const input = createInput({
          commitMessages: ['Decided to use NestJS guards for authentication'],
        });

        const result = service.extract(input);

        const decisions = result.filter((m) => m.episodeType === 'decision');
        expect(decisions.length).toBeGreaterThanOrEqual(1);
        expect(decisions[0].content).toContain('Decided to use NestJS');
        expect(decisions[0].confidence).toBe(0.9);
      });

      it('should extract decision from commit message containing "chose"', () => {
        const input = createInput({
          commitMessages: ['Chose BullMQ over RabbitMQ for task queuing'],
        });

        const result = service.extract(input);

        const decisions = result.filter((m) => m.episodeType === 'decision');
        expect(decisions.length).toBeGreaterThanOrEqual(1);
        expect(decisions[0].content).toContain('Chose BullMQ');
      });

      it('should extract decision from commit message containing "selected"', () => {
        const input = createInput({
          commitMessages: ['Selected TypeORM for database ORM layer'],
        });

        const result = service.extract(input);

        const decisions = result.filter((m) => m.episodeType === 'decision');
        expect(decisions.length).toBeGreaterThanOrEqual(1);
      });

      it('should extract decision from commit message containing "using"', () => {
        const input = createInput({
          commitMessages: ['Using Redis for session caching'],
        });

        const result = service.extract(input);

        const decisions = result.filter((m) => m.episodeType === 'decision');
        expect(decisions.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Fact extraction', () => {
      it('should extract fact from file paths with API endpoints', () => {
        const input = createInput({
          filesChanged: [
            'src/modules/memory/memory.controller.ts',
            'src/modules/memory/controllers/ingestion.controller.ts',
          ],
        });

        const result = service.extract(input);

        const facts = result.filter((m) => m.episodeType === 'fact');
        expect(facts.length).toBeGreaterThanOrEqual(1);
        const apiFact = facts.find((f) =>
          f.content.toLowerCase().includes('api') ||
          f.content.toLowerCase().includes('endpoint'),
        );
        expect(apiFact).toBeDefined();
        expect(apiFact!.confidence).toBe(0.8);
      });

      it('should extract fact from file paths with database entities', () => {
        const input = createInput({
          filesChanged: [
            'src/modules/agents/entities/agent.entity.ts',
            'src/modules/agents/entities/agent-job.entity.ts',
          ],
        });

        const result = service.extract(input);

        const facts = result.filter((m) => m.episodeType === 'fact');
        const entityFact = facts.find((f) =>
          f.content.toLowerCase().includes('entit'),
        );
        expect(entityFact).toBeDefined();
      });

      it('should extract fact from deployment URL', () => {
        const input = createInput({
          deploymentUrl: 'https://devos-api.railway.app',
        });

        const result = service.extract(input);

        const facts = result.filter((m) => m.episodeType === 'fact');
        const deployFact = facts.find((f) =>
          f.content.includes('Deployed to'),
        );
        expect(deployFact).toBeDefined();
        expect(deployFact!.content).toContain('devos-api.railway.app');
      });

      it('should extract fact from PR URL', () => {
        const input = createInput({
          prUrl: 'https://github.com/org/repo/pull/42',
        });

        const result = service.extract(input);

        const facts = result.filter((m) => m.episodeType === 'fact');
        const prFact = facts.find((f) => f.content.includes('Pull request'));
        expect(prFact).toBeDefined();
      });

      it('should extract fact from branch name', () => {
        const input = createInput({
          branch: 'feature/memory-ingestion',
        });

        const result = service.extract(input);

        const facts = result.filter((m) => m.episodeType === 'fact');
        const branchFact = facts.find((f) => f.content.includes('branch'));
        expect(branchFact).toBeDefined();
        expect(branchFact!.content).toContain('feature/memory-ingestion');
      });
    });

    describe('Problem extraction', () => {
      it('should extract problem from error message', () => {
        const input = createInput({
          errorMessage: 'TypeORM migration failed: column workspace_id does not exist',
          exitCode: 1,
        });

        const result = service.extract(input);

        const problems = result.filter((m) => m.episodeType === 'problem');
        expect(problems.length).toBeGreaterThanOrEqual(1);
        expect(problems[0].content).toContain('Error encountered');
        expect(problems[0].confidence).toBe(0.7);
      });

      it('should extract problem from failed tests', () => {
        const input = createInput({
          testResults: { passed: 45, failed: 3, total: 48 },
        });

        const result = service.extract(input);

        const problems = result.filter((m) => m.episodeType === 'problem');
        const testProblem = problems.find((p) =>
          p.content.includes('Test failures'),
        );
        expect(testProblem).toBeDefined();
        expect(testProblem!.content).toContain('3 of 48 tests failed');
      });

      it('should extract problem from commit messages with "fixed"', () => {
        const input = createInput({
          commitMessages: ['Fixed migration failure by adding missing column'],
        });

        const result = service.extract(input);

        const problems = result.filter((m) => m.episodeType === 'problem');
        expect(problems.length).toBeGreaterThanOrEqual(1);
        expect(problems[0].content).toContain('Problem resolved');
      });
    });

    describe('Preference extraction', () => {
      it('should extract preference from .spec. test file naming pattern', () => {
        const input = createInput({
          filesChanged: [
            'src/modules/memory/services/memory-ingestion.service.spec.ts',
            'src/modules/memory/services/memory-extraction.service.spec.ts',
            'src/modules/memory/memory.controller.spec.ts',
          ],
        });

        const result = service.extract(input);

        const preferences = result.filter(
          (m) => m.episodeType === 'preference',
        );
        expect(preferences.length).toBeGreaterThanOrEqual(1);
        const testPref = preferences.find((p) =>
          p.content.includes('.spec.'),
        );
        expect(testPref).toBeDefined();
        expect(testPref!.confidence).toBe(0.5);
      });

      it('should detect kebab-case file naming convention', () => {
        const input = createInput({
          filesChanged: [
            'src/modules/memory/memory-ingestion.service.ts',
            'src/modules/memory/memory-extraction.service.ts',
            'src/modules/memory/memory-deduplication.service.ts',
            'src/modules/memory/memory-health.service.ts',
          ],
        });

        const result = service.extract(input);

        const preferences = result.filter(
          (m) => m.episodeType === 'preference',
        );
        const namingPref = preferences.find((p) =>
          p.content.includes('kebab-case'),
        );
        expect(namingPref).toBeDefined();
      });
    });

    describe('Pattern extraction', () => {
      it('should extract pattern from all-passing tests', () => {
        const input = createInput({
          testResults: { passed: 62, failed: 0, total: 62 },
          agentType: 'dev',
        });

        const result = service.extract(input);

        const patterns = result.filter((m) => m.episodeType === 'pattern');
        const testPattern = patterns.find((p) =>
          p.content.includes('tests passed'),
        );
        expect(testPattern).toBeDefined();
        expect(testPattern!.content).toContain('62 tests passed');
        expect(testPattern!.confidence).toBe(0.6);
      });

      it('should extract pattern from successful task completion', () => {
        const input = createInput({
          exitCode: 0,
          durationMs: 45000,
          agentType: 'dev',
        });

        const result = service.extract(input);

        const patterns = result.filter((m) => m.episodeType === 'pattern');
        const completionPattern = patterns.find((p) =>
          p.content.includes('completed successfully'),
        );
        expect(completionPattern).toBeDefined();
        expect(completionPattern!.content).toContain('45s');
      });

      it('should extract pattern from pipeline metadata with tech stack', () => {
        const input = createInput({
          pipelineMetadata: {
            techStack: 'NestJS, TypeORM, Redis',
          },
        });

        const result = service.extract(input);

        const patterns = result.filter((m) => m.episodeType === 'pattern');
        const techPattern = patterns.find((p) =>
          p.content.includes('tech stack'),
        );
        expect(techPattern).toBeDefined();
        expect(techPattern!.content).toContain('NestJS');
      });
    });

    describe('Edge cases', () => {
      it('should return empty array when input has no extractable data', () => {
        const input = createInput({
          branch: null,
          commitHash: null,
          exitCode: null,
          durationMs: 0,
          filesChanged: [],
          commitMessages: [],
          testResults: null,
          prUrl: null,
          deploymentUrl: null,
          errorMessage: null,
          pipelineMetadata: {},
        });

        const result = service.extract(input);

        expect(result).toEqual([]);
      });

      it('should handle null/undefined fields in IngestionInput gracefully', () => {
        const input = createInput({
          storyId: null,
          branch: null,
          commitHash: null,
          exitCode: null,
          outputSummary: null,
          testResults: null,
          prUrl: null,
          deploymentUrl: null,
          errorMessage: null,
        });

        // Should not throw
        expect(() => service.extract(input)).not.toThrow();
      });

      it('should limit extraction to maximum 20 episodes', () => {
        // Create input with many extractable items
        const commitMessages = Array.from(
          { length: 25 },
          (_, i) => `Decided to use library-${i} for component-${i}`,
        );

        const input = createInput({
          commitMessages,
          filesChanged: [
            'src/controllers/a.controller.ts',
            'src/controllers/b.controller.ts',
            'src/entities/a.entity.ts',
            'src/services/a.service.ts',
          ],
          testResults: { passed: 10, failed: 2, total: 12 },
          errorMessage: 'Some error occurred',
          deploymentUrl: 'https://app.example.com',
          prUrl: 'https://github.com/org/repo/pull/1',
        });

        const result = service.extract(input);

        expect(result.length).toBeLessThanOrEqual(20);
      });

      it('should set appropriate confidence scores', () => {
        const input = createInput({
          commitMessages: ['Decided to use Redis for caching'],
          filesChanged: ['src/modules/cache/cache.service.ts'],
          errorMessage: 'Connection timeout error',
          testResults: { passed: 10, failed: 0, total: 10 },
          exitCode: 0,
          durationMs: 5000,
        });

        const result = service.extract(input);

        const decisions = result.filter((m) => m.episodeType === 'decision');
        const facts = result.filter((m) => m.episodeType === 'fact');
        const problems = result.filter((m) => m.episodeType === 'problem');
        const patterns = result.filter((m) => m.episodeType === 'pattern');

        if (decisions.length > 0)
          expect(decisions[0].confidence).toBe(0.9);
        if (facts.length > 0) expect(facts[0].confidence).toBe(0.8);
        if (problems.length > 0) expect(problems[0].confidence).toBe(0.7);
        if (patterns.length > 0) expect(patterns[0].confidence).toBe(0.6);
      });

      it('should extract entity references from file paths and libraries', () => {
        const input = createInput({
          commitMessages: ['Decided to use NestJS guards for auth'],
          filesChanged: [
            'src/modules/memory/services/graphiti.service.ts',
          ],
        });

        const result = service.extract(input);

        const decisions = result.filter((m) => m.episodeType === 'decision');
        if (decisions.length > 0) {
          expect(decisions[0].entities.length).toBeGreaterThan(0);
        }
      });

      it('should format content as human-readable natural language descriptions', () => {
        const input = createInput({
          commitMessages: ['Decided to use BullMQ for task queue'],
          errorMessage: 'Migration failed: missing column',
          deploymentUrl: 'https://app.example.com',
        });

        const result = service.extract(input);

        for (const memory of result) {
          // Content should be readable, not raw data
          expect(memory.content.length).toBeGreaterThan(5);
          expect(memory.content).not.toMatch(/^\{/); // Not raw JSON
          expect(memory.content).not.toMatch(/^undefined$/);
        }
      });
    });
  });
});
