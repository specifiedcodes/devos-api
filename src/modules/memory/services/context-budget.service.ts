/**
 * ContextBudgetService
 * Story 12.8: Context Budget System
 *
 * Provides intelligent context budget management for agent context assembly.
 * Calculates token budgets based on target model context windows, assembles
 * context in priority order within budget constraints, adjusts context volume
 * based on task complexity, and enhances context on retry attempts.
 *
 * Key features:
 * - Model context window registry (configurable via environment)
 * - Budget calculation: 30% response, 10% system prompt, 60% context sources
 * - Priority-ordered context assembly (Tier 1 > Story > Tier 2 > Memories > Patterns > Tier 3)
 * - Dynamic complexity adjustment (simple 40%, medium 70%, complex 100%)
 * - Retry enhancement with expanded context on failures
 * - Token estimation caching with content-hash-based invalidation
 * - Event-driven tracking via EventEmitter2
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ContextBudget,
  ContextAllocations,
  ContextAssemblyParams,
  AssembledContext,
  ContextUtilizationReport,
} from '../interfaces/memory.interfaces';
import { MemoryQueryService } from './memory-query.service';

/**
 * Default model context windows in tokens.
 */
const DEFAULT_MODEL_WINDOWS: Record<string, number> = {
  'claude-3-5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-haiku': 200000,
  'gpt-4': 128000,
  'gpt-4-turbo': 128000,
  'gpt-3.5-turbo': 16385,
  default: 200000,
};

/**
 * Complexity scaling factors for context budget.
 */
const COMPLEXITY_SCALE: Record<string, number> = {
  simple: 0.4,
  medium: 0.7,
  complex: 1.0,
};

/**
 * Memory query limits per complexity level.
 */
const MEMORY_LIMITS: Record<string, number> = {
  simple: 5,
  medium: 15,
  complex: 50,
};

@Injectable()
export class ContextBudgetService {
  private readonly logger = new Logger(ContextBudgetService.name);

  /**
   * LRU token estimation cache: key = content hash, value = token count.
   * Max 100 entries; oldest evicted when full.
   */
  private tokenCache: Map<string, number> = new Map();
  private static readonly TOKEN_CACHE_MAX = 100;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @Optional() @Inject(MemoryQueryService) private readonly memoryQueryService?: MemoryQueryService,
  ) {}

  // ─── Model Context Window Registry ──────────────────────────────────────────

  /**
   * Get the context window size for a model.
   * Reads from CONTEXT_BUDGET_MODEL_WINDOWS config or falls back to defaults.
   */
  getModelContextWindow(modelId: string): number {
    const configWindows = this.getModelWindowsFromConfig();
    if (configWindows[modelId] !== undefined) {
      return configWindows[modelId];
    }
    if (configWindows['default'] !== undefined) {
      return configWindows['default'];
    }
    return DEFAULT_MODEL_WINDOWS['default'];
  }

  // ─── Budget Calculation ──────────────────────────────────────────────────────

  /**
   * Calculate a context budget for the given model.
   * Reserves percentages for response generation and system prompt,
   * then allocates the remainder across context sources in priority order.
   */
  calculateBudget(modelId: string): ContextBudget {
    const totalTokens = this.getModelContextWindow(modelId);
    const responseReservePercent = this.getResponseReservePercent();
    const systemPromptPercent = this.getSystemPromptPercent();

    const responseReserve = Math.floor(totalTokens * (responseReservePercent / 100));
    const systemPromptTokens = Math.floor(totalTokens * (systemPromptPercent / 100));
    const availableForContext = Math.max(0, totalTokens - responseReserve - systemPromptTokens);

    // Calculate priority allocations
    const tier1 = Math.min(500, availableForContext);
    const remainingAfterTier1 = availableForContext - tier1;

    const storyContext = Math.min(2000, remainingAfterTier1);
    const remainingAfterStory = remainingAfterTier1 - storyContext;

    const tier2 = Math.min(10000, remainingAfterStory);
    const remainingAfterTier2 = remainingAfterStory - tier2;

    const memories = Math.min(Math.floor(remainingAfterTier2 * 0.6), remainingAfterTier2);
    const remainingAfterMemories = remainingAfterTier2 - memories;

    const patterns = Math.min(2000, remainingAfterMemories);
    const remainingAfterPatterns = remainingAfterMemories - patterns;

    const tier3 = remainingAfterPatterns;

    const allocations: ContextAllocations = {
      tier1,
      storyContext,
      tier2,
      memories,
      tier3,
      patterns,
    };

    const usedTokens: ContextAllocations = {
      tier1: 0,
      storyContext: 0,
      tier2: 0,
      memories: 0,
      tier3: 0,
      patterns: 0,
    };

    const budget: ContextBudget = {
      modelId,
      totalTokens,
      responseReserve,
      systemPromptTokens,
      availableForContext,
      allocations,
      usedTokens,
      totalUsed: 0,
      utilizationPercent: 0,
    };

    this.eventEmitter.emit('context:budget_calculated', { budget });

    return budget;
  }

  // ─── Token Estimation ────────────────────────────────────────────────────────

  /**
   * Estimate token count for a string (~4 characters per token).
   * Uses content-hash-based caching for performance.
   */
  estimateTokens(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }

    const cacheKey = this.getContentHash(text);
    const cached = this.tokenCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const tokens = Math.ceil(text.length / 4);

    // LRU eviction: remove oldest entry if at capacity
    if (this.tokenCache.size >= ContextBudgetService.TOKEN_CACHE_MAX) {
      const firstKey = this.tokenCache.keys().next().value;
      if (firstKey !== undefined) {
        this.tokenCache.delete(firstKey);
      }
    }

    this.tokenCache.set(cacheKey, tokens);
    return tokens;
  }

  /**
   * Clear the token estimation cache (for testing).
   */
  clearTokenCache(): void {
    this.tokenCache.clear();
  }

  // ─── Context Assembly ────────────────────────────────────────────────────────

  /**
   * Assemble context within budget constraints.
   * Sources are added in strict priority order, with complexity-based scaling.
   */
  async assembleContext(params: ContextAssemblyParams): Promise<AssembledContext> {
    const startTime = Date.now();
    const budget = this.calculateBudget(params.modelId);
    const complexity = params.taskComplexity ?? 'medium';
    const effectiveBudget = this.getEffectiveBudget(budget, complexity);

    const sourcesIncluded: string[] = [];
    const sourcesSkipped: string[] = [];
    const sourcesTruncated: string[] = [];
    const warnings: string[] = [];
    const contextParts: string[] = [];
    let remainingTokens = effectiveBudget;

    // Track used tokens per source
    const usedTokens: ContextAllocations = {
      tier1: 0,
      storyContext: 0,
      tier2: 0,
      memories: 0,
      tier3: 0,
      patterns: 0,
    };

    // 1. Tier 1 content (.devoscontext) - always included
    if (params.tier1Content) {
      const result = this.addSource(
        params.tier1Content,
        remainingTokens,
        'tier1',
        sourcesIncluded,
        sourcesSkipped,
        sourcesTruncated,
        contextParts,
      );
      usedTokens.tier1 = result.tokensUsed;
      remainingTokens -= result.tokensUsed;
    }

    // 2. Story content - always included
    if (params.storyContent) {
      const result = this.addSource(
        params.storyContent,
        remainingTokens,
        'storyContext',
        sourcesIncluded,
        sourcesSkipped,
        sourcesTruncated,
        contextParts,
      );
      usedTokens.storyContext = result.tokensUsed;
      remainingTokens -= result.tokensUsed;
    }

    // 3. Error context for retry (before Tier 2 for higher priority)
    if (params.isRetry && params.errorContext) {
      const errorSection = `## Previous Attempt Error\n${params.errorContext}`;
      const errorTokens = this.estimateTokens(errorSection);
      if (errorTokens <= remainingTokens) {
        contextParts.push(errorSection);
        remainingTokens -= errorTokens;
        sourcesIncluded.push('errorContext');
      }
    }

    // 4. Tier 2 content (DEVOS.md) - included for medium and complex
    if (complexity !== 'simple' && params.tier2Content) {
      const result = this.addSource(
        params.tier2Content,
        remainingTokens,
        'tier2',
        sourcesIncluded,
        sourcesSkipped,
        sourcesTruncated,
        contextParts,
      );
      usedTokens.tier2 = result.tokensUsed;
      remainingTokens -= result.tokensUsed;
    } else if (complexity === 'simple' && params.tier2Content) {
      sourcesSkipped.push('tier2');
    }

    // 5. Memories from MemoryQueryService - fill remaining budget
    if (this.memoryQueryService && remainingTokens > 0) {
      try {
        const baseMemoryBudget = Math.min(remainingTokens, budget.allocations.memories);
        // On retry, expand the memory token budget (up to remaining tokens) to fetch more context
        const memoryTokenBudget = params.isRetry
          ? Math.min(remainingTokens, baseMemoryBudget * 2)
          : baseMemoryBudget;

        const memoryContext = await this.memoryQueryService.queryForAgentContext(
          params.projectId,
          params.workspaceId,
          params.taskDescription,
          params.agentType,
          memoryTokenBudget,
        );

        if (memoryContext.contextString) {
          const memTokens = this.estimateTokens(memoryContext.contextString);
          if (memTokens <= remainingTokens) {
            contextParts.push(memoryContext.contextString);
            usedTokens.memories = memTokens;
            remainingTokens -= memTokens;
            sourcesIncluded.push('memories');
          } else {
            const truncated = this.truncateToTokenBudget(
              memoryContext.contextString,
              remainingTokens,
            );
            const truncTokens = this.estimateTokens(truncated);
            contextParts.push(truncated);
            usedTokens.memories = truncTokens;
            remainingTokens -= truncTokens;
            sourcesIncluded.push('memories');
            sourcesTruncated.push('memories');
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to query memories for context assembly: ${error instanceof Error ? error.message : String(error)}`,
        );
        sourcesSkipped.push('memories');
      }
    }

    // 6. Cross-project patterns - included for retry and complex tasks
    // Note: Patterns are delivered via MemoryQueryService.queryForAgentContext when
    // CrossProjectLearningService is available. Their token usage is accounted for
    // within the memories allocation. We track them separately for reporting purposes.
    if ((params.isRetry || complexity === 'complex') && remainingTokens > 0) {
      if (sourcesIncluded.includes('memories')) {
        sourcesIncluded.push('patterns');
        // Pattern tokens are included in the memories token count since they are
        // delivered via the same query pipeline. Estimate ~10% of memory tokens as patterns.
        usedTokens.patterns = Math.floor(usedTokens.memories * 0.1);
        usedTokens.memories -= usedTokens.patterns;
      }
    } else if (complexity === 'simple') {
      sourcesSkipped.push('patterns');
    }

    // 7. Tier 3 content (project-state.yaml) - included for complex or retry
    if ((complexity === 'complex' || params.isRetry) && params.tier3Content && remainingTokens > 0) {
      const result = this.addSource(
        params.tier3Content,
        remainingTokens,
        'tier3',
        sourcesIncluded,
        sourcesSkipped,
        sourcesTruncated,
        contextParts,
      );
      usedTokens.tier3 = result.tokensUsed;
      remainingTokens -= result.tokensUsed;
    } else if (params.tier3Content && complexity !== 'complex' && !params.isRetry) {
      sourcesSkipped.push('tier3');
    }

    // Calculate totals
    const totalUsed =
      usedTokens.tier1 +
      usedTokens.storyContext +
      usedTokens.tier2 +
      usedTokens.memories +
      usedTokens.tier3 +
      usedTokens.patterns;
    const utilizationPercent =
      budget.availableForContext > 0
        ? (totalUsed / budget.availableForContext) * 100
        : 0;

    // Update budget with actual usage
    budget.usedTokens = usedTokens;
    budget.totalUsed = totalUsed;
    budget.utilizationPercent = utilizationPercent;

    // Check for warning threshold (80% of available context budget)
    if (utilizationPercent > 80) {
      const warningMsg = `Context usage exceeds 80% of available context budget (${utilizationPercent.toFixed(1)}% utilized)`;
      warnings.push(warningMsg);
      this.eventEmitter.emit('context:budget_warning', {
        budget,
        utilizationPercent,
        warning: warningMsg,
      });
    }

    const assemblyDurationMs = Date.now() - startTime;

    const result: AssembledContext = {
      contextString: contextParts.join('\n\n'),
      budget,
      sourcesIncluded,
      sourcesSkipped,
      sourcesTruncated,
      assemblyDurationMs,
      warnings,
    };

    this.eventEmitter.emit('context:assembly_completed', { result });

    return result;
  }

  // ─── Complexity Budget Scaling ───────────────────────────────────────────────

  /**
   * Get effective budget based on task complexity.
   * Simple: 40%, Medium: 70%, Complex: 100% of available budget.
   */
  getEffectiveBudget(budget: ContextBudget, complexity: string): number {
    const scale = COMPLEXITY_SCALE[complexity] ?? COMPLEXITY_SCALE['medium'];
    return Math.floor(budget.availableForContext * scale);
  }

  // ─── Truncation Helper ───────────────────────────────────────────────────────

  /**
   * Truncate text to fit within a token budget.
   * If the text fits, returns as-is. Otherwise truncates and appends a marker.
   */
  truncateToTokenBudget(text: string, maxTokens: number): string {
    const currentTokens = this.estimateTokens(text);
    if (currentTokens <= maxTokens) {
      return text;
    }

    const truncationMarker = '\n\n[... truncated to fit context budget ...]';
    const markerTokens = this.estimateTokens(truncationMarker);
    const availableTokens = maxTokens - markerTokens;

    if (availableTokens <= 0) {
      return truncationMarker;
    }

    const maxChars = availableTokens * 4;
    return text.substring(0, maxChars) + truncationMarker;
  }

  // ─── Utilization Report ──────────────────────────────────────────────────────

  /**
   * Generate a utilization report from a context budget.
   */
  getContextUtilization(budget: ContextBudget): ContextUtilizationReport {
    const perSource: Record<string, { allocated: number; used: number }> = {
      tier1: { allocated: budget.allocations.tier1, used: budget.usedTokens.tier1 },
      storyContext: {
        allocated: budget.allocations.storyContext,
        used: budget.usedTokens.storyContext,
      },
      tier2: { allocated: budget.allocations.tier2, used: budget.usedTokens.tier2 },
      memories: { allocated: budget.allocations.memories, used: budget.usedTokens.memories },
      patterns: { allocated: budget.allocations.patterns, used: budget.usedTokens.patterns },
      tier3: { allocated: budget.allocations.tier3, used: budget.usedTokens.tier3 },
    };

    return {
      modelId: budget.modelId,
      totalBudget: budget.availableForContext,
      totalUsed: budget.totalUsed,
      utilizationPercent: budget.utilizationPercent,
      perSource,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Add a source to the assembled context, handling truncation if needed.
   */
  private addSource(
    content: string,
    remainingTokens: number,
    sourceName: string,
    sourcesIncluded: string[],
    sourcesSkipped: string[],
    sourcesTruncated: string[],
    contextParts: string[],
  ): { tokensUsed: number } {
    const tokens = this.estimateTokens(content);

    if (tokens <= remainingTokens) {
      contextParts.push(content);
      sourcesIncluded.push(sourceName);
      return { tokensUsed: tokens };
    }

    if (remainingTokens > 0) {
      // Truncate to fit
      const truncated = this.truncateToTokenBudget(content, remainingTokens);
      const truncTokens = this.estimateTokens(truncated);
      contextParts.push(truncated);
      sourcesIncluded.push(sourceName);
      sourcesTruncated.push(sourceName);
      return { tokensUsed: truncTokens };
    }

    sourcesSkipped.push(sourceName);
    return { tokensUsed: 0 };
  }

  /**
   * Generate a content hash for token cache key.
   * Samples start, middle, and end of string plus length
   * to reduce collision risk for strings with shared prefixes.
   */
  private getContentHash(text: string): string {
    const len = text.length;
    const mid = Math.floor(len / 2);
    const start = text.substring(0, 64);
    const middle = text.substring(mid, mid + 32);
    const end = text.substring(Math.max(0, len - 32));
    return `${start}|${middle}|${end}:${len}`;
  }

  /**
   * Get model windows from config, falling back to defaults.
   */
  private getModelWindowsFromConfig(): Record<string, number> {
    const configValue = this.configService.get<string>('CONTEXT_BUDGET_MODEL_WINDOWS');
    if (configValue) {
      try {
        return JSON.parse(configValue);
      } catch {
        this.logger.warn('Failed to parse CONTEXT_BUDGET_MODEL_WINDOWS config, using defaults');
      }
    }
    return DEFAULT_MODEL_WINDOWS;
  }

  /**
   * Get response reserve percentage from config.
   * Clamped to 0-90 to ensure valid budget allocation.
   */
  private getResponseReservePercent(): number {
    const value = parseInt(
      this.configService.get<string>('CONTEXT_BUDGET_RESPONSE_RESERVE_PERCENT', '30'),
      10,
    );
    const percent = isNaN(value) ? 30 : value;
    return Math.max(0, Math.min(90, percent));
  }

  /**
   * Get system prompt percentage from config.
   * Clamped to 0-90 to ensure valid budget allocation.
   */
  private getSystemPromptPercent(): number {
    const value = parseInt(
      this.configService.get<string>('CONTEXT_BUDGET_SYSTEM_PROMPT_PERCENT', '10'),
      10,
    );
    const percent = isNaN(value) ? 10 : value;
    return Math.max(0, Math.min(90, percent));
  }
}
