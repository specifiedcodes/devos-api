/**
 * TaskContextAssembler Tests
 * Story 11.3: Agent-to-CLI Execution Pipeline
 * Story 12.4: Three-Tier Context Recovery Enhancement (Memory Integration)
 *
 * TDD: Tests written first, then implementation.
 * Tests context assembly, prompt formatting, and Graphiti memory integration.
 */

// Mock ESM modules that cause Jest transform issues (Story 12.4: MemoryQueryService chain)
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-v4'),
}));
jest.mock('neo4j-driver', () => ({
  default: {
    driver: jest.fn(),
  },
  auth: { basic: jest.fn() },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TaskContextAssemblerService } from './task-context-assembler.service';
import { AgentTaskContext } from '../interfaces/pipeline-job.interfaces';
import { MemoryQueryService } from '../../memory/services/memory-query.service';
import * as fsPromises from 'fs/promises';

jest.mock('fs/promises');

describe('TaskContextAssemblerService', () => {
  let service: TaskContextAssemblerService;
  let configService: jest.Mocked<ConfigService>;
  const mockedFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;

  const mockWorkspacePath = '/workspaces/ws-123/proj-456';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskContextAssemblerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(''),
          },
        },
      ],
    }).compile();

    service = module.get<TaskContextAssemblerService>(
      TaskContextAssemblerService,
    );
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  describe('assembleContext', () => {
    it('should return complete context with story details', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      const result = await service.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Implement login feature',
          storyDescription: 'Build the login page',
          acceptanceCriteria: ['User can login', 'Error shown on failure'],
          techStack: 'NestJS, TypeScript, PostgreSQL',
          codeStylePreferences: 'ESLint, Prettier',
          testingStrategy: 'Jest unit tests, TDD approach',
        },
      });

      expect(result.storyTitle).toBe('Implement login feature');
      expect(result.storyDescription).toBe('Build the login page');
      expect(result.acceptanceCriteria).toEqual([
        'User can login',
        'Error shown on failure',
      ]);
      expect(result.techStack).toBe('NestJS, TypeScript, PostgreSQL');
      expect(result.codeStylePreferences).toBe('ESLint, Prettier');
      expect(result.testingStrategy).toBe('Jest unit tests, TDD approach');
    });

    it('should read .devoscontext if present in workspace', async () => {
      mockedFsPromises.access.mockImplementation((path: any) => {
        if (String(path).endsWith('.devoscontext')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockedFsPromises.readFile.mockResolvedValue(
        'This is the DevOS project context for testing.',
      );
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      const result = await service.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Test',
          storyDescription: 'Test desc',
          acceptanceCriteria: [],
        },
      });

      expect(result.projectContext).toBe(
        'This is the DevOS project context for testing.',
      );
    });

    it('should return empty projectContext if no context file exists', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      const result = await service.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Test',
          storyDescription: 'Test desc',
          acceptanceCriteria: [],
        },
      });

      expect(result.projectContext).toBe('');
    });

    it('should include previous agent output from pipeline metadata', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      const result = await service.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Test',
          storyDescription: 'Test desc',
          acceptanceCriteria: [],
          previousAgentOutput: 'QA found 3 issues: missing tests, no validation, memory leak',
        },
      });

      expect(result.previousAgentOutput).toBe(
        'QA found 3 issues: missing tests, no validation, memory leak',
      );
    });

    it('should handle missing storyId gracefully', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      const result = await service.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: null,
        agentType: 'planner',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Planning phase',
          storyDescription: 'Plan the project',
          acceptanceCriteria: [],
        },
      });

      expect(result).toBeDefined();
      expect(result.storyTitle).toBe('Planning phase');
    });

    it('should list existing files from workspace', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockImplementation((path: any) => {
        const pathStr = String(path);
        if (pathStr === mockWorkspacePath) {
          return Promise.resolve(['package.json', 'tsconfig.json', 'src', 'node_modules'] as any);
        }
        if (pathStr === `${mockWorkspacePath}/src`) {
          return Promise.resolve(['main.ts', 'app.module.ts'] as any);
        }
        return Promise.resolve([] as any);
      });

      const result = await service.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Test',
          storyDescription: 'Test desc',
          acceptanceCriteria: [],
        },
      });

      expect(result.existingFiles).toContain('package.json');
      expect(result.existingFiles).toContain('tsconfig.json');
      expect(result.existingFiles).toContain('src/main.ts');
      expect(result.existingFiles).toContain('src/app.module.ts');
    });
  });

  describe('formatTaskPrompt', () => {
    const baseContext: AgentTaskContext = {
      storyTitle: 'Build Auth Module',
      storyDescription: 'Implement JWT authentication',
      acceptanceCriteria: ['Users can login', 'Token refresh works'],
      techStack: 'NestJS, TypeScript',
      codeStylePreferences: 'ESLint with Airbnb preset',
      testingStrategy: 'Jest with TDD',
      existingFiles: ['src/main.ts', 'package.json'],
      projectContext: 'DevOS project with microservices architecture',
      previousAgentOutput: null,
    };

    it('should format dev agent prompt with TDD instructions', () => {
      const prompt = service.formatTaskPrompt(baseContext, 'dev');

      expect(prompt).toContain('Build Auth Module');
      expect(prompt).toContain('Implement JWT authentication');
      expect(prompt).toContain('Users can login');
      expect(prompt).toContain('Token refresh works');
      expect(prompt).toContain('TDD');
      expect(prompt).toContain('Write failing tests FIRST');
    });

    it('should format qa agent prompt with coverage requirements', () => {
      const prompt = service.formatTaskPrompt(baseContext, 'qa');

      expect(prompt).toContain('Build Auth Module');
      expect(prompt).toContain('80%');
      expect(prompt).toContain('Security');
      expect(prompt).toContain('Acceptance Criteria');
    });

    it('should format planner agent prompt with project goals', () => {
      const prompt = service.formatTaskPrompt(baseContext, 'planner');

      expect(prompt).toContain('Build Auth Module');
      expect(prompt).toContain('Given/When/Then');
      expect(prompt).toContain('epics');
    });

    it('should format devops agent prompt with deployment config', () => {
      const prompt = service.formatTaskPrompt(baseContext, 'devops');

      expect(prompt).toContain('Build Auth Module');
      expect(prompt).toContain('Deploy');
      expect(prompt).toContain('Smoke');
      expect(prompt).toContain('Rollback');
    });

    it('should include acceptance criteria in all prompts', () => {
      const agentTypes = ['dev', 'qa', 'planner', 'devops'];

      for (const agentType of agentTypes) {
        const prompt = service.formatTaskPrompt(baseContext, agentType);
        expect(prompt).toContain('Users can login');
        expect(prompt).toContain('Token refresh works');
      }
    });

    it('should include previous agent output when present', () => {
      const contextWithPrevious: AgentTaskContext = {
        ...baseContext,
        previousAgentOutput: 'Previous QA found 2 bugs in auth flow',
      };

      const prompt = service.formatTaskPrompt(contextWithPrevious, 'dev');
      expect(prompt).toContain('Previous QA found 2 bugs in auth flow');
    });

    it('should use dev template as fallback for unknown agent types', () => {
      const prompt = service.formatTaskPrompt(baseContext, 'unknown-type');
      // Should not throw, should use dev template as fallback
      expect(prompt).toContain('Build Auth Module');
    });
  });

  // ── Story 12.4: Graphiti Memory Integration Tests ─────────────────────

  describe('assembleContext with Graphiti memory (Story 12.4)', () => {
    let serviceWithMemory: TaskContextAssemblerService;
    let mockMemoryQueryService: any;

    beforeEach(async () => {
      mockMemoryQueryService = {
        query: jest.fn().mockResolvedValue({
          memories: [],
          totalCount: 0,
          relevanceScores: [],
          queryDurationMs: 5,
        }),
        queryForAgentContext: jest.fn().mockResolvedValue({
          contextString: '## Relevant Project Memory\n\n### Decisions\n- Used NestJS modules',
          memoryCount: 1,
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TaskContextAssemblerService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: any) => {
                if (key === 'CONTEXT_MEMORY_TOKEN_BUDGET') return '4000';
                return defaultValue ?? '';
              }),
            },
          },
          {
            provide: MemoryQueryService,
            useValue: mockMemoryQueryService,
          },
        ],
      }).compile();

      serviceWithMemory = module.get<TaskContextAssemblerService>(
        TaskContextAssemblerService,
      );
    });

    it('should include Graphiti memory context when MemoryQueryService available', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      const result = await serviceWithMemory.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Test',
          storyDescription: 'Build feature X',
          acceptanceCriteria: [],
        },
      });

      expect(result.memoryContext).toBeDefined();
      expect(result.memoryContext).toContain('Relevant Project Memory');
      expect(mockMemoryQueryService.queryForAgentContext).toHaveBeenCalledWith(
        'proj-456',
        'ws-123',
        'Build feature X',
        'dev',
        4000,
      );
    });

    it('should work without memory context when MemoryQueryService unavailable (null)', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      // Use the service WITHOUT MemoryQueryService (from beforeEach of parent describe)
      const result = await service.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Test',
          storyDescription: 'Test desc',
          acceptanceCriteria: [],
        },
      });

      expect(result.memoryContext).toBeUndefined();
    });

    it('should append memory context after file-based context', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      const result = await serviceWithMemory.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Test',
          storyDescription: 'Build feature X',
          acceptanceCriteria: [],
        },
      });

      // projectContext is file-based, memoryContext is from Graphiti
      expect(result.projectContext).toBeDefined();
      expect(result.memoryContext).toBeDefined();
      expect(result.memoryContext).toContain('Relevant Project Memory');
    });

    it('should respect configured token budget for memory context', async () => {
      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      await serviceWithMemory.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Test',
          storyDescription: 'Build feature X',
          acceptanceCriteria: [],
        },
      });

      // Verify token budget was passed
      expect(mockMemoryQueryService.queryForAgentContext).toHaveBeenCalledWith(
        'proj-456',
        'ws-123',
        'Build feature X',
        'dev',
        4000,
      );
    });

    it('should handle MemoryQueryService errors gracefully (proceeds without memory)', async () => {
      mockMemoryQueryService.queryForAgentContext.mockRejectedValue(
        new Error('Neo4j connection timeout'),
      );

      mockedFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockedFsPromises.readdir.mockResolvedValue([] as any);

      const result = await serviceWithMemory.assembleContext({
        workspaceId: 'ws-123',
        projectId: 'proj-456',
        storyId: 'story-1',
        agentType: 'dev',
        workspacePath: mockWorkspacePath,
        pipelineMetadata: {
          storyTitle: 'Test',
          storyDescription: 'Build feature X',
          acceptanceCriteria: [],
        },
      });

      // Should not throw, should proceed without memory
      expect(result).toBeDefined();
      expect(result.memoryContext).toBeUndefined();
    });
  });
});
