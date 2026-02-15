import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpendCapService, SpendLevel } from './spend-cap.service';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';

/**
 * Routing modifier applied to model selection based on spend level
 */
export interface RoutingModifier {
  preferEconomy: boolean;      // Prefer economy-tier models
  forceEconomy: boolean;       // Force cheapest capable model
  blockNonCritical: boolean;   // Only allow simple_chat queries
  downgradeMap: Record<string, string>;  // Model downgrades: { 'claude-sonnet-4': 'deepseek-chat' }
}

/**
 * Result of evaluating spend cap enforcement for a request
 */
export interface EnforcementDecision {
  allowed: boolean;            // Whether the request should proceed
  routingModifier: RoutingModifier | null;
  reason: string;              // Human-readable reason for enforcement action
  spendLevel: SpendLevel;
}

/**
 * Default downgrade mappings when no custom rules are configured.
 * Maps task types to economy model alternatives.
 */
export const DEFAULT_DOWNGRADE_MAP: Record<string, string> = {
  coding: 'deepseek-chat',
  planning: 'deepseek-chat',
  review: 'deepseek-chat',
  summarization: 'gemini-2.0-flash',
  simple_chat: 'gemini-2.0-flash',
  complex_reasoning: 'claude-sonnet-4-20250514',
  embedding: 'text-embedding-3-small',
};

/**
 * SpendCapEnforcementService - Auto-Downgrade Logic
 *
 * Story 13-7: Spend Caps & Auto-Downgrade
 *
 * Determines routing enforcement decisions based on spend level.
 * Called by the orchestrator before routing AI tasks.
 */
@Injectable()
export class SpendCapEnforcementService {
  private readonly logger = new Logger(SpendCapEnforcementService.name);

  constructor(
    private readonly spendCapService: SpendCapService,
    @InjectRepository(WorkspaceSettings)
    private readonly workspaceSettingsRepo: Repository<WorkspaceSettings>,
  ) {}

  /**
   * Main evaluation method: checks spend level and returns enforcement decision.
   *
   * @param workspaceId - Workspace to evaluate
   * @param taskType - The type of AI task being requested
   * @returns EnforcementDecision with routing modification instructions
   */
  async evaluate(workspaceId: string, taskType: string): Promise<EnforcementDecision> {
    const status = await this.spendCapService.getSpendCapStatus(workspaceId);

    // If spend cap is not enabled, allow everything
    if (!status.spendCapEnabled) {
      return {
        allowed: true,
        routingModifier: null,
        reason: 'Spend cap not enabled',
        spendLevel: SpendLevel.NORMAL,
      };
    }

    // HARD_CAP is absolute - even overrides cannot bypass it
    if (status.spendLevel === SpendLevel.HARD_CAP) {
      return {
        allowed: false,
        routingModifier: null,
        reason: `Monthly budget exceeded (${status.percentageUsed.toFixed(1)}%). All AI operations are paused.`,
        spendLevel: SpendLevel.HARD_CAP,
      };
    }

    // Check overrides (bypass downgrade logic, but NOT hard cap)
    if (this.isOverrideActive(status)) {
      return {
        allowed: true,
        routingModifier: null,
        reason: status.forcePremiumOverride
          ? 'Force premium override active - bypassing spend cap enforcement'
          : 'Auto-downgrade paused - bypassing spend cap enforcement',
        spendLevel: status.spendLevel,
      };
    }

    // Fetch workspace settings for custom downgrade rules
    const settings = await this.workspaceSettingsRepo.findOne({
      where: { workspaceId },
    });

    // CRITICAL - block non-critical tasks
    if (status.spendLevel === SpendLevel.CRITICAL) {
      if (taskType !== 'simple_chat') {
        return {
          allowed: false,
          routingModifier: this.buildRoutingModifier(status.spendLevel, settings ?? undefined),
          reason: `Critical spend level (${status.percentageUsed.toFixed(1)}%). Only simple_chat tasks are allowed.`,
          spendLevel: SpendLevel.CRITICAL,
        };
      }
      return {
        allowed: true,
        routingModifier: this.buildRoutingModifier(status.spendLevel, settings ?? undefined),
        reason: `Critical spend level but simple_chat is allowed.`,
        spendLevel: SpendLevel.CRITICAL,
      };
    }

    // DOWNGRADE - force economy models
    if (status.spendLevel === SpendLevel.DOWNGRADE) {
      return {
        allowed: true,
        routingModifier: this.buildRoutingModifier(status.spendLevel, settings ?? undefined),
        reason: `Downgrade level (${status.percentageUsed.toFixed(1)}%). Routing forced to cheapest capable models.`,
        spendLevel: SpendLevel.DOWNGRADE,
      };
    }

    // WARNING - prefer economy models
    if (status.spendLevel === SpendLevel.WARNING) {
      return {
        allowed: true,
        routingModifier: this.buildRoutingModifier(status.spendLevel, settings ?? undefined),
        reason: `Warning level (${status.percentageUsed.toFixed(1)}%). Economy models preferred.`,
        spendLevel: SpendLevel.WARNING,
      };
    }

    // NORMAL
    return {
      allowed: true,
      routingModifier: null,
      reason: 'Normal spend level',
      spendLevel: SpendLevel.NORMAL,
    };
  }

  /**
   * Builds routing modifier based on spend level.
   * Uses custom downgrade rules from settings if available, otherwise DEFAULT_DOWNGRADE_MAP.
   */
  buildRoutingModifier(
    spendLevel: SpendLevel,
    settings?: WorkspaceSettings,
  ): RoutingModifier {
    // Build downgrade map from custom rules or defaults
    let downgradeMap: Record<string, string> = { ...DEFAULT_DOWNGRADE_MAP };

    if (settings?.downgradeRules && Object.keys(settings.downgradeRules).length > 0) {
      downgradeMap = {};
      for (const [taskType, rule] of Object.entries(settings.downgradeRules)) {
        downgradeMap[taskType] = rule.to;
      }
    }

    switch (spendLevel) {
      case SpendLevel.WARNING:
        return {
          preferEconomy: true,
          forceEconomy: false,
          blockNonCritical: false,
          downgradeMap,
        };

      case SpendLevel.DOWNGRADE:
        return {
          preferEconomy: true,
          forceEconomy: true,
          blockNonCritical: false,
          downgradeMap,
        };

      case SpendLevel.CRITICAL:
        return {
          preferEconomy: true,
          forceEconomy: true,
          blockNonCritical: true,
          downgradeMap,
        };

      default:
        return {
          preferEconomy: false,
          forceEconomy: false,
          blockNonCritical: false,
          downgradeMap: {},
        };
    }
  }

  /**
   * Returns true if any override is active that should bypass downgrade logic.
   */
  isOverrideActive(
    statusOrSettings: { forcePremiumOverride: boolean; autoDowngradePaused: boolean },
  ): boolean {
    return statusOrSettings.forcePremiumOverride || statusOrSettings.autoDowngradePaused;
  }
}
