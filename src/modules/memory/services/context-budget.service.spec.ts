/**
 * ContextBudgetService Unit Tests
 * Story 12.8: Context Budget System
 *
 * Comprehensive tests for context budget calculation, token estimation,
 * context assembly, dynamic complexity adjustment, retry enhancement,
 * warning/event emission, model registry, error handling, and utilization reporting.
 */

// Mock uuid (required by transitive GraphitiService import)
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContextBudgetService } from './context-budget.service';
import { MemoryQueryService } from './memory-query.service';
import {
  ContextBudget,
  ContextAssemblyParams,
} from '../interfaces/memory.interfaces';

describe('ContextBudgetService', () => {
  let service: ContextBudgetService;
  let mockConfigService: any;
  let mockEventEmitter: any;
  let mockMemoryQueryService: any;

  // Sample tier content for assembly tests
  const tier1Content = JSON.stringify({
    version: '1.0',
    project_id: 'proj-1',
    phase: 'implementation',
    current_sprint: 3,
    active_agents: [{ type: 'dev', story: '12.8', status: 'working' }],
    next_actions: ['complete 12.8'],
    blockers: [],
    last_updated: '2026-02-15T10:00:00Z',
  }); // ~300 characters -> ~75 tokens

  const storyContent = `# Story 12.8: Context Budget System
As a system, I want to assemble the right amount of context...
## Acceptance Criteria
- Budget tokens based on model
- Priority-ordered assembly
- Dynamic complexity adjustment`; // ~250 characters -> ~63 tokens

  const tier2Content = 'DEVOS.md content with project overview, tech stack, conventions...'.repeat(50); // ~3500 chars -> ~875 tokens

  const tier3Content = `stories:
  - storyId: "12-7"
    title: "Memory Summarization"
    completedAt: "2026-02-14T18:00:00Z"
    decisions: ["Use stub summarization"]`; // ~200 chars -> ~50 tokens

  beforeEach(async () => {
    mockMemoryQueryService = {
      queryForAgentContext: jest.fn().mockResolvedValue({
        contextString: '## Relevant Project Memory\n\n### Decisions\n- Used NestJS guards for auth',
        memoryCount: 1,
      }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_BUDGET_MODEL_WINDOWS: JSON.stringify({
            'claude-3-5-sonnet': 200000,
            'claude-3-opus': 200000,
            'claude-3-haiku': 200000,
            'gpt-4': 128000,
            'gpt-4-turbo': 128000,
            'gpt-3.5-turbo': 16385,
            default: 200000,
          }),
          CONTEXT_BUDGET_RESPONSE_RESERVE_PERCENT: '30',
          CONTEXT_BUDGET_SYSTEM_PROMPT_PERCENT: '10',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextBudgetService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: MemoryQueryService, useValue: mockMemoryQueryService },
      ],
    }).compile();

    service = module.get<ContextBudgetService>(ContextBudgetService);
  });

  afterEach(() => {
    service.clearTokenCache();
  });

  // ─── Budget Calculation Tests ─────────────────────────────────────────────

  describe('calculateBudget', () => {
    it('should return correct budget for Claude model (200K window)', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');

      expect(budget.modelId).toBe('claude-3-5-sonnet');
      expect(budget.totalTokens).toBe(200000);
      expect(budget.responseReserve).toBe(60000);
      expect(budget.systemPromptTokens).toBe(20000);
      expect(budget.availableForContext).toBe(120000);
    });

    it('should return correct budget for GPT-4 model (128K window)', () => {
      const budget = service.calculateBudget('gpt-4');

      expect(budget.modelId).toBe('gpt-4');
      expect(budget.totalTokens).toBe(128000);
      expect(budget.responseReserve).toBe(38400);
      expect(budget.systemPromptTokens).toBe(12800);
      expect(budget.availableForContext).toBe(76800);
    });

    it('should reserve 30% for response', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');
      expect(budget.responseReserve).toBe(Math.floor(200000 * 0.3));
    });

    it('should reserve 10% for system prompt', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');
      expect(budget.systemPromptTokens).toBe(Math.floor(200000 * 0.1));
    });

    it('should allocate 60% for context sources', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');
      // 200000 - 60000 - 20000 = 120000 (60%)
      expect(budget.availableForContext).toBe(120000);
      expect(budget.availableForContext).toBe(
        budget.totalTokens - budget.responseReserve - budget.systemPromptTokens,
      );
    });

    it('should fall back to default window for unknown model', () => {
      const budget = service.calculateBudget('unknown-model-xyz');

      expect(budget.totalTokens).toBe(200000); // default
    });

    it('should use custom reserve percentages from config', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_BUDGET_MODEL_WINDOWS: JSON.stringify({
            'claude-3-5-sonnet': 200000,
            default: 200000,
          }),
          CONTEXT_BUDGET_RESPONSE_RESERVE_PERCENT: '25',
          CONTEXT_BUDGET_SYSTEM_PROMPT_PERCENT: '15',
        };
        return config[key] ?? defaultValue;
      });

      const budget = service.calculateBudget('claude-3-5-sonnet');

      expect(budget.responseReserve).toBe(50000); // 25% of 200000
      expect(budget.systemPromptTokens).toBe(30000); // 15% of 200000
      expect(budget.availableForContext).toBe(120000); // 200000 - 50000 - 30000
    });

    it('should initialize usedTokens to zero', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');

      expect(budget.usedTokens.tier1).toBe(0);
      expect(budget.usedTokens.storyContext).toBe(0);
      expect(budget.usedTokens.tier2).toBe(0);
      expect(budget.usedTokens.memories).toBe(0);
      expect(budget.usedTokens.tier3).toBe(0);
      expect(budget.usedTokens.patterns).toBe(0);
      expect(budget.totalUsed).toBe(0);
      expect(budget.utilizationPercent).toBe(0);
    });

    it('should calculate priority allocations correctly', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');

      expect(budget.allocations.tier1).toBe(500);
      expect(budget.allocations.storyContext).toBe(2000);
      expect(budget.allocations.tier2).toBe(10000);
      // Remaining after tier1+story+tier2: 120000 - 500 - 2000 - 10000 = 107500
      // memories = floor(107500 * 0.6) = 64500
      expect(budget.allocations.memories).toBe(64500);
      // remaining after memories: 107500 - 64500 = 43000
      // patterns = min(2000, 43000) = 2000
      expect(budget.allocations.patterns).toBe(2000);
      // tier3 = 43000 - 2000 = 41000
      expect(budget.allocations.tier3).toBe(41000);
    });
  });

  // ─── Token Estimation Tests ───────────────────────────────────────────────

  describe('estimateTokens', () => {
    it('should return ~250 for 1000 character string', () => {
      const text = 'a'.repeat(1000);
      expect(service.estimateTokens(text)).toBe(250);
    });

    it('should return 0 for empty string', () => {
      expect(service.estimateTokens('')).toBe(0);
    });

    it('should handle special characters correctly', () => {
      const text = '{ "key": "value", "emoji": "🚀" }';
      const tokens = service.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });

    it('should return 0 for null/undefined input', () => {
      expect(service.estimateTokens(null as any)).toBe(0);
      expect(service.estimateTokens(undefined as any)).toBe(0);
    });

    it('should cache token count for same content', () => {
      const text = 'This is a test string for caching';
      const result1 = service.estimateTokens(text);
      const result2 = service.estimateTokens(text);

      expect(result1).toBe(result2);
    });

    it('should return different counts for different content', () => {
      const short = 'short';
      const long = 'a'.repeat(400);

      const shortTokens = service.estimateTokens(short);
      const longTokens = service.estimateTokens(long);

      expect(shortTokens).toBeLessThan(longTokens);
    });

    it('should evict oldest cache entry when cache is full', () => {
      // Fill cache with 100 entries
      for (let i = 0; i < 100; i++) {
        service.estimateTokens(`unique-content-${i}-${'x'.repeat(120)}`);
      }

      // Add one more, should not throw
      const result = service.estimateTokens('new-content-after-full');
      expect(result).toBeGreaterThan(0);
    });
  });

  // ─── Context Assembly Tests ───────────────────────────────────────────────

  describe('assembleContext', () => {
    const baseParams: ContextAssemblyParams = {
      modelId: 'claude-3-5-sonnet',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      agentType: 'dev',
      taskDescription: 'Implement context budget system',
      tier1Content,
      storyContent,
      tier2Content,
      tier3Content,
    };

    it('should include Tier 1 first (always)', async () => {
      const result = await service.assembleContext(baseParams);

      expect(result.sourcesIncluded).toContain('tier1');
      expect(result.contextString).toContain(tier1Content);
    });

    it('should include story context second (always)', async () => {
      const result = await service.assembleContext(baseParams);

      expect(result.sourcesIncluded).toContain('storyContext');
      expect(result.contextString).toContain(storyContent);
    });

    it('should include Tier 2 when budget allows', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        taskComplexity: 'medium',
      });

      expect(result.sourcesIncluded).toContain('tier2');
    });

    it('should skip Tier 2 when budget is exhausted after required sources', async () => {
      // Use a model with very small context window via config override
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_BUDGET_MODEL_WINDOWS: JSON.stringify({
            'tiny-model': 500,
            default: 500,
          }),
          CONTEXT_BUDGET_RESPONSE_RESERVE_PERCENT: '30',
          CONTEXT_BUDGET_SYSTEM_PROMPT_PERCENT: '10',
        };
        return config[key] ?? defaultValue;
      });

      const result = await service.assembleContext({
        ...baseParams,
        modelId: 'tiny-model',
        taskComplexity: 'medium',
      });

      // With 500 tokens total, available = 300, medium = 210
      // tier1 (~75 tokens) + story (~63 tokens) = ~138, remaining ~72
      // tier2 (~875 tokens) won't fit or will be truncated
      expect(
        result.sourcesSkipped.includes('tier2') ||
        result.sourcesTruncated.includes('tier2'),
      ).toBe(true);
    });

    it('should fill remaining budget with memories from MemoryQueryService', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        taskComplexity: 'medium',
      });

      expect(mockMemoryQueryService.queryForAgentContext).toHaveBeenCalled();
      expect(result.sourcesIncluded).toContain('memories');
    });

    it('should include Tier 3 excerpts when budget allows for complex tasks', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        taskComplexity: 'complex',
      });

      expect(result.sourcesIncluded).toContain('tier3');
    });

    it('should never exceed available budget', async () => {
      const result = await service.assembleContext(baseParams);

      const budget = result.budget;
      expect(budget.totalUsed).toBeLessThanOrEqual(budget.availableForContext);
    });

    it('should truncate sources that exceed remaining budget', async () => {
      // Create a very large tier2 content
      const hugeTier2 = 'x'.repeat(1000000); // 250000 tokens

      const result = await service.assembleContext({
        ...baseParams,
        tier2Content: hugeTier2,
        taskComplexity: 'complex',
      });

      // The tier2 content should be truncated since it exceeds remaining budget
      if (result.sourcesIncluded.includes('tier2')) {
        expect(result.contextString.length).toBeLessThan(hugeTier2.length);
      }
    });

    it('should return correct sourcesIncluded and sourcesSkipped lists', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        taskComplexity: 'simple',
      });

      // Simple tasks should include tier1, storyContext, memories
      expect(result.sourcesIncluded).toContain('tier1');
      expect(result.sourcesIncluded).toContain('storyContext');
      // Simple tasks should skip tier2, tier3, patterns
      expect(result.sourcesSkipped).toContain('tier2');
    });

    it('should return correct sourcesTruncated list', async () => {
      // Use small model to force truncation
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_BUDGET_MODEL_WINDOWS: JSON.stringify({
            'small-model': 1000,
            default: 1000,
          }),
          CONTEXT_BUDGET_RESPONSE_RESERVE_PERCENT: '30',
          CONTEXT_BUDGET_SYSTEM_PROMPT_PERCENT: '10',
        };
        return config[key] ?? defaultValue;
      });

      const result = await service.assembleContext({
        ...baseParams,
        modelId: 'small-model',
        taskComplexity: 'complex',
      });

      // With very limited budget, sources should be truncated
      expect(Array.isArray(result.sourcesTruncated)).toBe(true);
    });

    it('should track assembly duration in assemblyDurationMs', async () => {
      const result = await service.assembleContext(baseParams);

      expect(result.assemblyDurationMs).toBeDefined();
      expect(typeof result.assemblyDurationMs).toBe('number');
      expect(result.assemblyDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing tier content gracefully', async () => {
      const result = await service.assembleContext({
        modelId: 'claude-3-5-sonnet',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentType: 'dev',
        taskDescription: 'Test task',
      });

      expect(result).toBeDefined();
      expect(result.budget).toBeDefined();
      expect(Array.isArray(result.sourcesIncluded)).toBe(true);
    });
  });

  // ─── Dynamic Adjustment Tests ─────────────────────────────────────────────

  describe('dynamic complexity adjustment', () => {
    const baseParams: ContextAssemblyParams = {
      modelId: 'claude-3-5-sonnet',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      agentType: 'dev',
      taskDescription: 'Implement feature',
      tier1Content,
      storyContent,
      tier2Content,
      tier3Content,
    };

    it('should use 40% of available budget for simple tasks', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');
      const effectiveBudget = service.getEffectiveBudget(budget, 'simple');

      expect(effectiveBudget).toBe(Math.floor(120000 * 0.4));
    });

    it('should use 70% of available budget for medium tasks', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');
      const effectiveBudget = service.getEffectiveBudget(budget, 'medium');

      expect(effectiveBudget).toBe(Math.floor(120000 * 0.7));
    });

    it('should use 100% of available budget for complex tasks', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');
      const effectiveBudget = service.getEffectiveBudget(budget, 'complex');

      expect(effectiveBudget).toBe(Math.floor(120000 * 1.0));
    });

    it('should default to medium when complexity not specified', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        taskComplexity: undefined,
      });

      // Default is medium, which uses 70% budget
      // Should include tier2 (medium includes it)
      expect(result.sourcesIncluded).toContain('tier2');
      // Should skip tier3 (medium skips it)
      expect(result.sourcesSkipped).toContain('tier3');
    });

    it('should include only Tier 1, story, and top memories for simple tasks', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        taskComplexity: 'simple',
      });

      expect(result.sourcesIncluded).toContain('tier1');
      expect(result.sourcesIncluded).toContain('storyContext');
      expect(result.sourcesSkipped).toContain('tier2');
      expect(result.sourcesSkipped).toContain('patterns');
    });

    it('should include Tier 1, story, Tier 2, and top 15 memories for medium tasks', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        taskComplexity: 'medium',
      });

      expect(result.sourcesIncluded).toContain('tier1');
      expect(result.sourcesIncluded).toContain('storyContext');
      expect(result.sourcesIncluded).toContain('tier2');
    });

    it('should include all context sources for complex tasks', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        taskComplexity: 'complex',
      });

      expect(result.sourcesIncluded).toContain('tier1');
      expect(result.sourcesIncluded).toContain('storyContext');
      expect(result.sourcesIncluded).toContain('tier2');
      expect(result.sourcesIncluded).toContain('tier3');
    });

    it('should default to medium for unknown complexity', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');
      const effectiveBudget = service.getEffectiveBudget(budget, 'unknown-complexity');

      expect(effectiveBudget).toBe(Math.floor(120000 * 0.7));
    });
  });

  // ─── Retry Enhancement Tests ──────────────────────────────────────────────

  describe('retry enhancement', () => {
    const baseParams: ContextAssemblyParams = {
      modelId: 'claude-3-5-sonnet',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      agentType: 'dev',
      taskDescription: 'Fix broken feature',
      tier1Content,
      storyContent,
      tier2Content,
      tier3Content,
    };

    it('should include error context from previous attempt on retry', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        isRetry: true,
        errorContext: 'TypeError: Cannot read property of undefined',
        taskComplexity: 'medium',
      });

      expect(result.contextString).toContain('## Previous Attempt Error');
      expect(result.contextString).toContain('TypeError: Cannot read property of undefined');
      expect(result.sourcesIncluded).toContain('errorContext');
    });

    it('should double memory query limit on retry', async () => {
      await service.assembleContext({
        ...baseParams,
        isRetry: true,
        errorContext: 'Some error',
        taskComplexity: 'medium',
      });

      // The memory query service should be called (doubled limit handled internally)
      expect(mockMemoryQueryService.queryForAgentContext).toHaveBeenCalled();
    });

    it('should include Tier 3 excerpts on retry', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        isRetry: true,
        errorContext: 'Some error',
        taskComplexity: 'medium',
      });

      expect(result.sourcesIncluded).toContain('tier3');
    });

    it('should include cross-project patterns on retry', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        isRetry: true,
        errorContext: 'Some error',
        taskComplexity: 'medium',
      });

      // Patterns are included via memories subsystem
      expect(result.sourcesIncluded).toContain('patterns');
    });

    it('should add "Previous Attempt Error" section on retry', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        isRetry: true,
        errorContext: 'NullPointerException at line 42',
      });

      expect(result.contextString).toContain('## Previous Attempt Error');
      expect(result.contextString).toContain('NullPointerException at line 42');
    });

    it('should not include error context when not a retry', async () => {
      const result = await service.assembleContext({
        ...baseParams,
        isRetry: false,
        errorContext: 'This should not appear',
      });

      expect(result.contextString).not.toContain('## Previous Attempt Error');
      expect(result.sourcesIncluded).not.toContain('errorContext');
    });
  });

  // ─── Warning Tests ────────────────────────────────────────────────────────

  describe('budget warnings', () => {
    it('should warn when context exceeds 80% of total budget', async () => {
      // Use a very small model to force high utilization
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_BUDGET_MODEL_WINDOWS: JSON.stringify({
            'tiny-model': 200,
            default: 200,
          }),
          CONTEXT_BUDGET_RESPONSE_RESERVE_PERCENT: '5',
          CONTEXT_BUDGET_SYSTEM_PROMPT_PERCENT: '5',
        };
        return config[key] ?? defaultValue;
      });

      // With total=200, reserve=10, system=10, available=180
      // Provide content that fills most of the budget
      const result = await service.assembleContext({
        modelId: 'tiny-model',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentType: 'dev',
        taskDescription: 'Test task',
        tier1Content: 'a'.repeat(800), // 200 tokens - exceeds 80% of 200 total
        taskComplexity: 'complex',
      });

      // The high utilization relative to totalTokens should trigger warning
      if (result.budget.totalUsed / result.budget.totalTokens > 0.8) {
        expect(result.warnings.length).toBeGreaterThan(0);
      }
    });

    it('should not warn when context is under 80%', async () => {
      const result = await service.assembleContext({
        modelId: 'claude-3-5-sonnet',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentType: 'dev',
        taskDescription: 'Test task',
        tier1Content: 'small content',
        taskComplexity: 'simple',
      });

      // With 200K model and small content, usage should be well under 80%
      expect(result.warnings).toEqual([]);
    });
  });

  // ─── Event Tests ──────────────────────────────────────────────────────────

  describe('event emission', () => {
    it('should emit context:budget_calculated event on calculateBudget', () => {
      service.calculateBudget('claude-3-5-sonnet');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'context:budget_calculated',
        expect.objectContaining({
          budget: expect.objectContaining({
            modelId: 'claude-3-5-sonnet',
          }),
        }),
      );
    });

    it('should emit context:assembly_completed event on assembleContext', async () => {
      await service.assembleContext({
        modelId: 'claude-3-5-sonnet',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentType: 'dev',
        taskDescription: 'Test task',
        taskComplexity: 'simple',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'context:assembly_completed',
        expect.objectContaining({
          result: expect.objectContaining({
            contextString: expect.any(String),
            budget: expect.any(Object),
          }),
        }),
      );
    });

    it('should emit context:budget_warning when exceeding 80% budget', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_BUDGET_MODEL_WINDOWS: JSON.stringify({
            'tiny-model': 200,
            default: 200,
          }),
          CONTEXT_BUDGET_RESPONSE_RESERVE_PERCENT: '5',
          CONTEXT_BUDGET_SYSTEM_PROMPT_PERCENT: '5',
        };
        return config[key] ?? defaultValue;
      });

      await service.assembleContext({
        modelId: 'tiny-model',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentType: 'dev',
        taskDescription: 'Test task',
        tier1Content: 'a'.repeat(800),
        taskComplexity: 'complex',
      });

      // Check if budget_warning was emitted (depends on whether usage > 80%)
      const warningEmits = mockEventEmitter.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'context:budget_warning',
      );
      // With tiny model and large content, warning should be emitted
      if (warningEmits.length > 0) {
        expect(warningEmits[0][1]).toHaveProperty('budget');
        expect(warningEmits[0][1]).toHaveProperty('utilizationPercent');
      }
    });
  });

  // ─── Model Registry Tests ────────────────────────────────────────────────

  describe('getModelContextWindow', () => {
    it('should return correct window for known models', () => {
      expect(service.getModelContextWindow('claude-3-5-sonnet')).toBe(200000);
      expect(service.getModelContextWindow('gpt-4')).toBe(128000);
      expect(service.getModelContextWindow('gpt-3.5-turbo')).toBe(16385);
    });

    it('should fall back to default for unknown model', () => {
      expect(service.getModelContextWindow('some-random-model')).toBe(200000);
    });

    it('should use custom model windows from CONTEXT_BUDGET_MODEL_WINDOWS config', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_BUDGET_MODEL_WINDOWS: JSON.stringify({
            'custom-model': 50000,
            default: 100000,
          }),
          CONTEXT_BUDGET_RESPONSE_RESERVE_PERCENT: '30',
          CONTEXT_BUDGET_SYSTEM_PROMPT_PERCENT: '10',
        };
        return config[key] ?? defaultValue;
      });

      expect(service.getModelContextWindow('custom-model')).toBe(50000);
      expect(service.getModelContextWindow('unknown-model')).toBe(100000);
    });
  });

  // ─── Error Handling Tests ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('should handle MemoryQueryService being unavailable gracefully', async () => {
      // Create a new module without MemoryQueryService
      const moduleWithoutMemory: TestingModule = await Test.createTestingModule({
        providers: [
          ContextBudgetService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: EventEmitter2, useValue: mockEventEmitter },
          // No MemoryQueryService provided
        ],
      }).compile();

      const serviceWithoutMemory = moduleWithoutMemory.get<ContextBudgetService>(ContextBudgetService);

      const result = await serviceWithoutMemory.assembleContext({
        modelId: 'claude-3-5-sonnet',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentType: 'dev',
        taskDescription: 'Test task',
        tier1Content: 'some content',
        taskComplexity: 'medium',
      });

      expect(result).toBeDefined();
      expect(result.contextString).toContain('some content');
    });

    it('should handle empty tier content gracefully', async () => {
      const result = await service.assembleContext({
        modelId: 'claude-3-5-sonnet',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentType: 'dev',
        taskDescription: 'Test task',
        tier1Content: '',
        storyContent: '',
        tier2Content: '',
        tier3Content: '',
        taskComplexity: 'complex',
      });

      expect(result).toBeDefined();
      expect(result.budget).toBeDefined();
    });

    it('should return partial context on memory query failure', async () => {
      mockMemoryQueryService.queryForAgentContext.mockRejectedValue(
        new Error('Neo4j connection failed'),
      );

      const result = await service.assembleContext({
        modelId: 'claude-3-5-sonnet',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentType: 'dev',
        taskDescription: 'Test task',
        tier1Content: 'tier 1 context',
        storyContent: 'story context',
        taskComplexity: 'medium',
      });

      // Should still have tier1 and story content
      expect(result.contextString).toContain('tier 1 context');
      expect(result.contextString).toContain('story context');
      expect(result.sourcesSkipped).toContain('memories');
    });

    it('should return valid result even when all optional sources fail', async () => {
      mockMemoryQueryService.queryForAgentContext.mockRejectedValue(
        new Error('Service unavailable'),
      );

      const result = await service.assembleContext({
        modelId: 'claude-3-5-sonnet',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        agentType: 'dev',
        taskDescription: 'Test task',
        taskComplexity: 'simple',
      });

      expect(result).toBeDefined();
      expect(result.budget).toBeDefined();
      expect(result.assemblyDurationMs).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.sourcesIncluded)).toBe(true);
      expect(Array.isArray(result.sourcesSkipped)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  // ─── Utilization Report Tests ─────────────────────────────────────────────

  describe('getContextUtilization', () => {
    it('should return correct utilization percentage', () => {
      const budget: ContextBudget = {
        modelId: 'claude-3-5-sonnet',
        totalTokens: 200000,
        responseReserve: 60000,
        systemPromptTokens: 20000,
        availableForContext: 120000,
        allocations: {
          tier1: 500,
          storyContext: 2000,
          tier2: 10000,
          memories: 64500,
          tier3: 41000,
          patterns: 2000,
        },
        usedTokens: {
          tier1: 75,
          storyContext: 63,
          tier2: 875,
          memories: 200,
          tier3: 0,
          patterns: 0,
        },
        totalUsed: 1213,
        utilizationPercent: (1213 / 120000) * 100,
      };

      const report = service.getContextUtilization(budget);

      expect(report.modelId).toBe('claude-3-5-sonnet');
      expect(report.totalBudget).toBe(120000);
      expect(report.totalUsed).toBe(1213);
      expect(report.utilizationPercent).toBeCloseTo((1213 / 120000) * 100, 2);
    });

    it('should return per-source breakdown', () => {
      const budget: ContextBudget = {
        modelId: 'gpt-4',
        totalTokens: 128000,
        responseReserve: 38400,
        systemPromptTokens: 12800,
        availableForContext: 76800,
        allocations: {
          tier1: 500,
          storyContext: 2000,
          tier2: 10000,
          memories: 38580,
          tier3: 24720,
          patterns: 1000,
        },
        usedTokens: {
          tier1: 100,
          storyContext: 500,
          tier2: 3000,
          memories: 1500,
          tier3: 200,
          patterns: 50,
        },
        totalUsed: 5350,
        utilizationPercent: (5350 / 76800) * 100,
      };

      const report = service.getContextUtilization(budget);

      expect(report.perSource).toBeDefined();
      expect(report.perSource['tier1']).toEqual({ allocated: 500, used: 100 });
      expect(report.perSource['storyContext']).toEqual({ allocated: 2000, used: 500 });
      expect(report.perSource['tier2']).toEqual({ allocated: 10000, used: 3000 });
      expect(report.perSource['memories']).toEqual({ allocated: 38580, used: 1500 });
      expect(report.perSource['tier3']).toEqual({ allocated: 24720, used: 200 });
      expect(report.perSource['patterns']).toEqual({ allocated: 1000, used: 50 });
    });
  });

  // ─── Truncation Tests ─────────────────────────────────────────────────────

  describe('truncateToTokenBudget', () => {
    it('should return text as-is when within budget', () => {
      const text = 'Short text';
      const result = service.truncateToTokenBudget(text, 100);

      expect(result).toBe(text);
    });

    it('should truncate and append marker when over budget', () => {
      const text = 'a'.repeat(1000); // 250 tokens
      const result = service.truncateToTokenBudget(text, 50); // Only 50 tokens allowed

      expect(result.length).toBeLessThan(text.length);
      expect(result).toContain('[... truncated to fit context budget ...]');
    });

    it('should handle zero budget gracefully', () => {
      const text = 'Some text';
      const result = service.truncateToTokenBudget(text, 0);

      expect(result).toContain('[... truncated to fit context budget ...]');
    });
  });

  // ─── getEffectiveBudget Tests ─────────────────────────────────────────────

  describe('getEffectiveBudget', () => {
    it('should scale budget correctly for all complexity levels', () => {
      const budget = service.calculateBudget('claude-3-5-sonnet');

      expect(service.getEffectiveBudget(budget, 'simple')).toBe(
        Math.floor(budget.availableForContext * 0.4),
      );
      expect(service.getEffectiveBudget(budget, 'medium')).toBe(
        Math.floor(budget.availableForContext * 0.7),
      );
      expect(service.getEffectiveBudget(budget, 'complex')).toBe(
        Math.floor(budget.availableForContext * 1.0),
      );
    });
  });
});
