/**
 * ContextGenerationService Tests
 * Story 12.4: Three-Tier Context Recovery Enhancement
 *
 * TDD: Tests written first, then implementation verified.
 * Tests Tier 1 (.devoscontext), Tier 2 (DEVOS.md), Tier 3 (project-state.yaml),
 * file write methods, and refreshAllTiers.
 */

// Mock ESM modules that cause Jest transform issues
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
import * as fsPromises from 'fs/promises';
import * as yaml from 'js-yaml';
import { ContextGenerationService } from './context-generation.service';
import { MemoryQueryService } from '../../memory/services/memory-query.service';
import { PipelineStateStore } from '../../orchestrator/services/pipeline-state-store.service';
import { PipelineContext, PipelineState } from '../../orchestrator/interfaces/pipeline.interfaces';
import {
  DevOSContext,
  ProjectStateEntry,
  ProjectMetadata,
} from '../interfaces/context-generation.interfaces';

jest.mock('fs/promises');

const mockedFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;

describe('ContextGenerationService', () => {
  let service: ContextGenerationService;
  let mockMemoryQueryService: any;
  let mockConfigService: any;
  let mockPipelineStateStore: any;

  const mockProjectId = 'proj-uuid-123';
  const mockWorkspaceId = 'ws-uuid-456';
  const mockWorkspacePath = '/workspaces/ws-uuid-456/proj-uuid-123';

  const mockPipelineState: PipelineContext = {
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    workflowId: 'wf-1',
    currentState: PipelineState.IMPLEMENTING,
    previousState: PipelineState.PLANNING,
    stateEnteredAt: new Date(),
    activeAgentId: 'agent-1',
    activeAgentType: 'dev',
    currentStoryId: '12.4',
    retryCount: 0,
    maxRetries: 3,
    metadata: { sprint: 5 },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockProjectMetadata: ProjectMetadata = {
    name: 'DevOS',
    description: 'AI-powered development platform',
    techStack: 'NestJS, TypeScript, PostgreSQL, Redis',
    conventions: 'ESLint, Prettier, TDD',
    architectureSummary: 'Modular NestJS architecture',
    currentEpic: 'Epic 12: AI Memory',
    sprintNumber: 5,
    activeStories: ['12.4', '12.5'],
    completedCount: 3,
    totalCount: 10,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockMemoryQueryService = {
      query: jest.fn().mockResolvedValue({
        memories: [],
        totalCount: 0,
        relevanceScores: [],
        queryDurationMs: 5,
      }),
      queryForAgentContext: jest.fn().mockResolvedValue({
        contextString: '',
        memoryCount: 0,
      }),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_GENERATION_ENABLED: 'true',
          CONTEXT_DEVOS_MD_MAX_DECISIONS: '20',
          CONTEXT_DEVOS_MD_MAX_PROBLEMS: '10',
          CONTEXT_MEMORY_TOKEN_BUDGET: '4000',
        };
        return config[key] ?? defaultValue;
      }),
    };

    mockPipelineStateStore = {
      getState: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextGenerationService,
        { provide: MemoryQueryService, useValue: mockMemoryQueryService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PipelineStateStore, useValue: mockPipelineStateStore },
      ],
    }).compile();

    service = module.get<ContextGenerationService>(ContextGenerationService);
  });

  // ── Tier 1: .devoscontext Generation Tests ────────────────────────────

  describe('generateDevOSContext', () => {
    it('should create valid JSON with all required fields', async () => {
      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
        mockPipelineState,
      );

      expect(result.version).toBe('1.0');
      expect(result.project_id).toBe(mockProjectId);
      expect(result.workspace_id).toBe(mockWorkspaceId);
      expect(result.phase).toBeDefined();
      expect(result.current_sprint).toBeDefined();
      expect(result.active_agents).toBeDefined();
      expect(Array.isArray(result.active_agents)).toBe(true);
      expect(result.next_actions).toBeDefined();
      expect(Array.isArray(result.next_actions)).toBe(true);
      expect(result.blockers).toBeDefined();
      expect(Array.isArray(result.blockers)).toBe(true);
      expect(result.last_updated).toBeDefined();
    });

    it('should include active agents from pipeline state', async () => {
      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
        mockPipelineState,
      );

      expect(result.active_agents).toHaveLength(1);
      expect(result.active_agents[0].type).toBe('dev');
      expect(result.active_agents[0].story).toBe('12.4');
      expect(result.active_agents[0].status).toBe('working');
    });

    it('should include next actions based on story status', async () => {
      const implementingState = {
        ...mockPipelineState,
        currentState: PipelineState.IMPLEMENTING,
      };

      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
        implementingState,
      );

      expect(result.next_actions.length).toBeGreaterThan(0);
      expect(result.next_actions).toContain('Complete implementation');
    });

    it('should include blockers from pipeline metadata', async () => {
      const stateWithBlockers: PipelineContext = {
        ...mockPipelineState,
        metadata: {
          sprint: 5,
          blockers: ['Waiting for API key', 'Database migration needed'],
        },
      };

      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
        stateWithBlockers,
      );

      expect(result.blockers).toContain('Waiting for API key');
      expect(result.blockers).toContain('Database migration needed');
    });

    it('should produce output <2KB for typical projects', async () => {
      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
        mockPipelineState,
      );

      const jsonSize = JSON.stringify(result).length;
      expect(jsonSize).toBeLessThan(2048);
    });

    it('should handle missing/empty project data gracefully', async () => {
      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
        null,
      );

      expect(result.version).toBe('1.0');
      expect(result.project_id).toBe(mockProjectId);
      expect(result.phase).toBe('planning');
      expect(result.active_agents).toEqual([]);
      expect(result.blockers).toEqual([]);
    });

    it('should set phase to implementation when pipeline is implementing', async () => {
      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
        mockPipelineState,
      );

      expect(result.phase).toBe('implementation');
    });

    it('should set phase to qa when pipeline is in QA', async () => {
      const qaState = {
        ...mockPipelineState,
        currentState: PipelineState.QA,
        activeAgentType: 'qa',
      };

      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
        qaState,
      );

      expect(result.phase).toBe('qa');
      expect(result.active_agents[0].status).toBe('reviewing');
    });

    it('should load pipeline state from store when not provided', async () => {
      mockPipelineStateStore.getState.mockResolvedValue(mockPipelineState);

      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
      );

      expect(mockPipelineStateStore.getState).toHaveBeenCalledWith(mockProjectId);
      expect(result.phase).toBe('implementation');
    });

    it('should extract sprint number from pipeline metadata', async () => {
      const result = await service.generateDevOSContext(
        mockProjectId,
        mockWorkspaceId,
        mockPipelineState,
      );

      expect(result.current_sprint).toBe(5);
    });
  });

  // ── Tier 2: DEVOS.md Generation Tests ─────────────────────────────────

  describe('generateDevOSMd', () => {
    it('should create valid markdown with all sections', async () => {
      const result = await service.generateDevOSMd(
        mockProjectId,
        mockWorkspaceId,
        mockProjectMetadata,
      );

      expect(result).toContain('# DEVOS Project Context');
      expect(result).toContain('## Project Overview');
      expect(result).toContain('## Tech Stack');
      expect(result).toContain('## Architecture Summary');
      expect(result).toContain('## Current Workflow State');
      expect(result).toContain('## Coding Conventions');
      expect(result).toContain('## Key Decisions');
      expect(result).toContain('## Recent Problems Solved');
    });

    it('should include project name and description', async () => {
      const result = await service.generateDevOSMd(
        mockProjectId,
        mockWorkspaceId,
        mockProjectMetadata,
      );

      expect(result).toContain('DevOS');
      expect(result).toContain('AI-powered development platform');
    });

    it('should include key decisions from Graphiti memory', async () => {
      mockMemoryQueryService.query.mockResolvedValueOnce({
        memories: [
          {
            id: 'ep-1',
            content: 'Used EventEmitter2 for event-driven triggers',
            timestamp: new Date('2026-02-10'),
            episodeType: 'decision',
            confidence: 0.9,
            metadata: {},
          },
        ],
        totalCount: 1,
        relevanceScores: [0.8],
        queryDurationMs: 5,
      });

      const result = await service.generateDevOSMd(
        mockProjectId,
        mockWorkspaceId,
        mockProjectMetadata,
      );

      expect(result).toContain('Used EventEmitter2 for event-driven triggers');
    });

    it('should include recent problems from Graphiti memory', async () => {
      // First call is for decisions
      mockMemoryQueryService.query
        .mockResolvedValueOnce({
          memories: [],
          totalCount: 0,
          relevanceScores: [],
          queryDurationMs: 5,
        })
        // Second call is for problems
        .mockResolvedValueOnce({
          memories: [
            {
              id: 'ep-2',
              content: 'Resolved circular dependency in module imports',
              timestamp: new Date('2026-02-12'),
              episodeType: 'problem',
              confidence: 0.85,
              metadata: {},
            },
          ],
          totalCount: 1,
          relevanceScores: [0.7],
          queryDurationMs: 3,
        });

      const result = await service.generateDevOSMd(
        mockProjectId,
        mockWorkspaceId,
        mockProjectMetadata,
      );

      expect(result).toContain('Resolved circular dependency in module imports');
    });

    it('should respect max decisions/problems config limits', async () => {
      // Override config to limit to 2 decisions
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'CONTEXT_DEVOS_MD_MAX_DECISIONS') return '2';
          if (key === 'CONTEXT_DEVOS_MD_MAX_PROBLEMS') return '1';
          return defaultValue;
        },
      );

      await service.generateDevOSMd(
        mockProjectId,
        mockWorkspaceId,
        mockProjectMetadata,
      );

      // Verify query was called with maxResults matching config
      const decisionsCall = mockMemoryQueryService.query.mock.calls[0];
      expect(decisionsCall[0].filters.maxResults).toBe(2);

      const problemsCall = mockMemoryQueryService.query.mock.calls[1];
      expect(problemsCall[0].filters.maxResults).toBe(1);
    });

    it('should handle Graphiti unavailability gracefully', async () => {
      // Create service without MemoryQueryService
      const moduleWithoutMemory: TestingModule =
        await Test.createTestingModule({
          providers: [
            ContextGenerationService,
            { provide: ConfigService, useValue: mockConfigService },
            {
              provide: PipelineStateStore,
              useValue: mockPipelineStateStore,
            },
          ],
        }).compile();

      const serviceWithoutMemory =
        moduleWithoutMemory.get<ContextGenerationService>(
          ContextGenerationService,
        );

      const result = await serviceWithoutMemory.generateDevOSMd(
        mockProjectId,
        mockWorkspaceId,
        mockProjectMetadata,
      );

      // Should still generate markdown, just without memory sections
      expect(result).toContain('# DEVOS Project Context');
      expect(result).toContain('## Key Decisions');
      expect(result).toContain('No memory service available');
    });

    it('should produce output <50KB for typical projects', async () => {
      const result = await service.generateDevOSMd(
        mockProjectId,
        mockWorkspaceId,
        mockProjectMetadata,
      );

      expect(result.length).toBeLessThan(50 * 1024);
    });

    it('should handle Graphiti query errors gracefully', async () => {
      mockMemoryQueryService.query.mockRejectedValue(
        new Error('Neo4j connection failed'),
      );

      const result = await service.generateDevOSMd(
        mockProjectId,
        mockWorkspaceId,
        mockProjectMetadata,
      );

      // Should still generate markdown
      expect(result).toContain('# DEVOS Project Context');
      expect(result).toContain('Failed to load decisions');
    });
  });

  // ── Tier 3: project-state.yaml Append Tests ───────────────────────────

  describe('appendProjectState', () => {
    const mockEntry: ProjectStateEntry = {
      storyId: '12.4',
      title: 'Three-Tier Context Recovery Enhancement',
      completedAt: '2026-02-15T10:00:00Z',
      agentType: 'dev',
      decisions: ['Used EventEmitter2 for triggers'],
      issues: [],
      filesChanged: 15,
      testsPassed: 92,
      memoryEpisodeIds: ['ep-1', 'ep-2'],
    };

    it('should create valid YAML entry with story data', async () => {
      mockedFsPromises.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);

      await service.appendProjectState(
        mockWorkspacePath,
        mockProjectId,
        mockWorkspaceId,
        mockEntry,
      );

      const writeCall = mockedFsPromises.writeFile.mock.calls[0];
      expect(writeCall[0]).toContain('project-state.yaml');

      const writtenContent = writeCall[1] as string;
      const parsed = yaml.load(writtenContent) as any;
      expect(parsed.stories).toHaveLength(1);
      expect(parsed.stories[0].storyId).toBe('12.4');
      expect(parsed.stories[0].title).toBe(
        'Three-Tier Context Recovery Enhancement',
      );
    });

    it('should include memory episode IDs', async () => {
      mockedFsPromises.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);

      await service.appendProjectState(
        mockWorkspacePath,
        mockProjectId,
        mockWorkspaceId,
        mockEntry,
      );

      const writtenContent = mockedFsPromises.writeFile.mock.calls[0][1] as string;
      const parsed = yaml.load(writtenContent) as any;
      expect(parsed.stories[0].memoryEpisodeIds).toEqual(['ep-1', 'ep-2']);
    });

    it('should preserve existing entries when appending', async () => {
      const existingYaml = yaml.dump({
        version: '1.0',
        project_id: mockProjectId,
        workspace_id: mockWorkspaceId,
        generated_at: '2026-02-14T10:00:00Z',
        stories: [
          {
            storyId: '12.3',
            title: 'Memory Query Service',
            completedAt: '2026-02-14T15:00:00Z',
            agentType: 'dev',
            decisions: ['Used keyword scoring'],
            issues: [],
            filesChanged: 8,
            testsPassed: 203,
            memoryEpisodeIds: ['ep-old-1'],
          },
        ],
      });

      mockedFsPromises.readFile.mockResolvedValue(existingYaml);
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);

      await service.appendProjectState(
        mockWorkspacePath,
        mockProjectId,
        mockWorkspaceId,
        mockEntry,
      );

      const writtenContent = mockedFsPromises.writeFile.mock.calls[0][1] as string;
      const parsed = yaml.load(writtenContent) as any;
      expect(parsed.stories).toHaveLength(2);
      expect(parsed.stories[0].storyId).toBe('12.3');
      expect(parsed.stories[1].storyId).toBe('12.4');
    });

    it('should create file if it does not exist', async () => {
      mockedFsPromises.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);

      await service.appendProjectState(
        mockWorkspacePath,
        mockProjectId,
        mockWorkspaceId,
        mockEntry,
      );

      expect(mockedFsPromises.writeFile).toHaveBeenCalled();
      const writtenContent = mockedFsPromises.writeFile.mock.calls[0][1] as string;
      const parsed = yaml.load(writtenContent) as any;
      expect(parsed.version).toBe('1.0');
      expect(parsed.project_id).toBe(mockProjectId);
    });

    it('should handle file write errors gracefully', async () => {
      mockedFsPromises.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockRejectedValue(
        new Error('Permission denied'),
      );

      await expect(
        service.appendProjectState(
          mockWorkspacePath,
          mockProjectId,
          mockWorkspaceId,
          mockEntry,
        ),
      ).rejects.toThrow('Permission denied');
    });
  });

  // ── File Write Method Tests ───────────────────────────────────────────

  describe('writeDevOSContext', () => {
    it('should write JSON file to correct workspace path', async () => {
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);

      const context: DevOSContext = {
        version: '1.0',
        project_id: mockProjectId,
        workspace_id: mockWorkspaceId,
        phase: 'implementation',
        current_sprint: 5,
        active_agents: [],
        next_actions: [],
        blockers: [],
        last_updated: new Date().toISOString(),
      };

      await service.writeDevOSContext(mockWorkspacePath, context);

      expect(mockedFsPromises.writeFile).toHaveBeenCalledWith(
        `${mockWorkspacePath}/.devoscontext`,
        expect.any(String),
        'utf-8',
      );

      const writtenJson = mockedFsPromises.writeFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenJson);
      expect(parsed.version).toBe('1.0');
    });
  });

  describe('writeDevOSMd', () => {
    it('should write markdown file to correct workspace path', async () => {
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);

      const markdown = '# DEVOS Project Context\n\nTest content';
      await service.writeDevOSMd(mockWorkspacePath, markdown);

      expect(mockedFsPromises.writeFile).toHaveBeenCalledWith(
        `${mockWorkspacePath}/DEVOS.md`,
        markdown,
        'utf-8',
      );
    });
  });

  describe('writeProjectState', () => {
    it('should write YAML file to correct workspace path', async () => {
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);

      const yamlContent = 'version: "1.0"\nstories: []';
      await service.writeProjectState(mockWorkspacePath, yamlContent);

      expect(mockedFsPromises.writeFile).toHaveBeenCalledWith(
        `${mockWorkspacePath}/project-state.yaml`,
        yamlContent,
        'utf-8',
      );
    });
  });

  // ── refreshAllTiers Tests ─────────────────────────────────────────────

  describe('refreshAllTiers', () => {
    it('should update all three tiers and return timing', async () => {
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile.mockResolvedValue(undefined);

      const result = await service.refreshAllTiers(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
        mockProjectMetadata,
      );

      expect(result.tier1Updated).toBe(true);
      expect(result.tier2Updated).toBe(true);
      expect(result.tier3Updated).toBe(false); // Tier 3 is append-only
      expect(result.refreshDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle Tier 1 failure gracefully', async () => {
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile
        .mockRejectedValueOnce(new Error('Tier 1 write failed'))
        .mockResolvedValue(undefined);

      const result = await service.refreshAllTiers(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
        mockProjectMetadata,
      );

      expect(result.tier1Updated).toBe(false);
      expect(result.tier2Updated).toBe(true);
    });

    it('should handle Tier 2 failure gracefully', async () => {
      mockedFsPromises.mkdir.mockResolvedValue(undefined);
      mockedFsPromises.writeFile
        .mockResolvedValueOnce(undefined) // Tier 1 succeeds
        .mockRejectedValueOnce(new Error('Tier 2 write failed')); // Tier 2 fails

      const result = await service.refreshAllTiers(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
        mockProjectMetadata,
      );

      expect(result.tier1Updated).toBe(true);
      expect(result.tier2Updated).toBe(false);
    });
  });
});
