/**
 * AgentConflictService
 *
 * Story 18-8: Agent Installation Flow
 *
 * Service for detecting conflicts before agent installation.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InstalledAgent } from '../../database/entities/installed-agent.entity';
import { AgentDefinition } from '../../database/entities/agent-definition.entity';
import { MarketplaceAgent } from '../../database/entities/marketplace-agent.entity';

export const ConflictType = {
  TOOL_PERMISSION_CONFLICT: 'tool_permission_conflict',
  VERSION_CONFLICT: 'version_conflict',
  RESOURCE_CONFLICT: 'resource_conflict',
  TRIGGER_CONFLICT: 'trigger_conflict',
} as const;

export type ConflictTypeValue = (typeof ConflictType)[keyof typeof ConflictType];

export interface AgentConflict {
  type: ConflictTypeValue;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  conflictingAgentId: string;
  conflictingAgentName: string;
  details: Record<string, unknown>;
  resolution?: string;
}

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: AgentConflict[];
  canForceInstall: boolean; // Some conflicts can be bypassed
  warnings: string[];
}

@Injectable()
export class AgentConflictService {
  private readonly logger = new Logger(AgentConflictService.name);

  constructor(
    @InjectRepository(InstalledAgent)
    private readonly installedAgentRepo: Repository<InstalledAgent>,
    @InjectRepository(AgentDefinition)
    private readonly definitionRepo: Repository<AgentDefinition>,
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentRepo: Repository<MarketplaceAgent>,
  ) {}

  /**
   * Check for all types of conflicts before installation.
   */
  async checkConflicts(
    marketplaceAgentId: string,
    workspaceId: string,
    targetVersion?: string,
  ): Promise<ConflictCheckResult> {
    this.logger.debug(
      `Checking conflicts for agent ${marketplaceAgentId} in workspace ${workspaceId}`,
    );

    const conflicts: AgentConflict[] = [];
    const warnings: string[] = [];

    // Get the marketplace agent and its definition
    const marketplaceAgent = await this.marketplaceAgentRepo.findOne({
      where: { id: marketplaceAgentId },
    });

    if (!marketplaceAgent) {
      return {
        hasConflicts: true,
        conflicts: [
          {
            type: ConflictType.VERSION_CONFLICT,
            severity: 'critical',
            message: 'Agent not found in marketplace',
            conflictingAgentId: '',
            conflictingAgentName: '',
            details: {},
          },
        ],
        canForceInstall: false,
        warnings: [],
      };
    }

    // Get the agent definition
    const definition = await this.definitionRepo.findOne({
      where: { id: marketplaceAgent.agentDefinitionId },
    });

    if (!definition) {
      return {
        hasConflicts: true,
        conflicts: [
          {
            type: ConflictType.VERSION_CONFLICT,
            severity: 'critical',
            message: 'Agent definition not found',
            conflictingAgentId: marketplaceAgentId,
            conflictingAgentName: marketplaceAgent.displayName,
            details: {},
          },
        ],
        canForceInstall: false,
        warnings: [],
      };
    }

    // Check if already installed
    const existingInstall = await this.installedAgentRepo.findOne({
      where: { workspaceId, marketplaceAgentId },
    });

    if (existingInstall) {
      conflicts.push({
        type: ConflictType.VERSION_CONFLICT,
        severity: 'high',
        message: `Agent is already installed (version ${existingInstall.installedVersion})`,
        conflictingAgentId: marketplaceAgentId,
        conflictingAgentName: marketplaceAgent.displayName,
        details: { installedVersion: existingInstall.installedVersion },
        resolution: 'Uninstall the existing version first, or use the update endpoint',
      });
    }

    // Check for tool permission conflicts
    const toolConflicts = await this.checkToolPermissionConflicts(
      definition,
      workspaceId,
      marketplaceAgentId,
      marketplaceAgent.displayName,
    );
    conflicts.push(...toolConflicts);

    // Check for trigger conflicts
    const triggerConflicts = await this.checkTriggerConflicts(
      definition,
      workspaceId,
      marketplaceAgentId,
      marketplaceAgent.displayName,
    );
    conflicts.push(...triggerConflicts);

    // Check for version conflicts with dependencies
    if (targetVersion) {
      const versionConflicts = await this.checkVersionConflicts(
        marketplaceAgentId,
        workspaceId,
        targetVersion,
      );
      conflicts.push(...versionConflicts);
    }

    // Determine if any critical conflicts exist
    const hasCritical = conflicts.some((c) => c.severity === 'critical');
    const hasHigh = conflicts.some((c) => c.severity === 'high');

    // Generate warnings for low/medium conflicts
    for (const conflict of conflicts) {
      if (conflict.severity === 'low' || conflict.severity === 'medium') {
        warnings.push(conflict.message);
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      canForceInstall: !hasCritical && !hasHigh,
      warnings,
    };
  }

  /**
   * Check for tool permission conflicts.
   * Detects when multiple agents request conflicting tool permissions.
   */
  async checkToolPermissionConflicts(
    definition: AgentDefinition,
    workspaceId: string,
    agentId: string,
    agentName: string,
  ): Promise<AgentConflict[]> {
    const conflicts: AgentConflict[] = [];

    // Extract tools from the new agent definition
    const newAgentTools = this.extractToolsFromDefinition(definition);
    const newAgentPermissions = this.extractPermissionsFromDefinition(definition);

    // Get all installed agents with their local definitions in a single query
    const installedAgents = await this.installedAgentRepo.find({
      where: { workspaceId },
      relations: ['marketplaceAgent'],
    });

    // Batch fetch all local definitions to avoid N+1 query
    const localDefinitionIds = installedAgents
      .filter((ia) => ia.localDefinitionId)
      .map((ia) => ia.localDefinitionId);

    const localDefinitions = localDefinitionIds.length > 0
      ? await this.definitionRepo.find({
          where: { id: In(localDefinitionIds) },
        })
      : [];

    // Create a map for quick lookup
    const definitionMap = new Map(localDefinitions.map((d) => [d.id, d]));

    for (const installed of installedAgents) {
      if (!installed.localDefinitionId) continue;

      const localDef = definitionMap.get(installed.localDefinitionId);
      if (!localDef) continue;

      const existingTools = this.extractToolsFromDefinition(localDef);
      const existingPermissions = this.extractPermissionsFromDefinition(localDef);

      // Check for exclusive tool conflicts
      const toolOverlap = newAgentTools.filter((t) => existingTools.includes(t));
      if (toolOverlap.length > 0) {
        conflicts.push({
          type: ConflictType.TOOL_PERMISSION_CONFLICT,
          severity: 'low',
          message: `Tool overlap with ${installed.marketplaceAgent?.displayName}: ${toolOverlap.join(', ')}`,
          conflictingAgentId: installed.marketplaceAgentId,
          conflictingAgentName: installed.marketplaceAgent?.displayName || 'Unknown',
          details: { overlappingTools: toolOverlap },
          resolution: 'Both agents can use these tools concurrently',
        });
      }

      // Check for permission conflicts
      const permissionOverlap = newAgentPermissions.filter((p) =>
        existingPermissions.includes(p),
      );
      if (permissionOverlap.length > 0) {
        conflicts.push({
          type: ConflictType.TOOL_PERMISSION_CONFLICT,
          severity: 'medium',
          message: `Permission overlap with ${installed.marketplaceAgent?.displayName}: ${permissionOverlap.join(', ')}`,
          conflictingAgentId: installed.marketplaceAgentId,
          conflictingAgentName: installed.marketplaceAgent?.displayName || 'Unknown',
          details: { overlappingPermissions: permissionOverlap },
          resolution: 'Review if both agents need these permissions',
        });
      }
    }

    return conflicts;
  }

  /**
   * Check for trigger conflicts.
   * Detects when multiple agents have the same auto-run triggers.
   */
  async checkTriggerConflicts(
    definition: AgentDefinition,
    workspaceId: string,
    agentId: string,
    agentName: string,
  ): Promise<AgentConflict[]> {
    const conflicts: AgentConflict[] = [];

    // Extract triggers from the new agent definition
    const newAgentTriggers = this.extractTriggersFromDefinition(definition);

    if (newAgentTriggers.length === 0) return conflicts;

    // Get all installed agents
    const installedAgents = await this.installedAgentRepo.find({
      where: { workspaceId },
      relations: ['marketplaceAgent'],
    });

    // Batch fetch all local definitions to avoid N+1 query
    const localDefinitionIds = installedAgents
      .filter((ia) => ia.localDefinitionId)
      .map((ia) => ia.localDefinitionId);

    const localDefinitions = localDefinitionIds.length > 0
      ? await this.definitionRepo.find({
          where: { id: In(localDefinitionIds) },
        })
      : [];

    // Create a map for quick lookup
    const definitionMap = new Map(localDefinitions.map((d) => [d.id, d]));

    for (const installed of installedAgents) {
      if (!installed.localDefinitionId) continue;

      const localDef = definitionMap.get(installed.localDefinitionId);
      if (!localDef) continue;

      const existingTriggers = this.extractTriggersFromDefinition(localDef);

      // Check for trigger conflicts
      for (const newTrigger of newAgentTriggers) {
        const matchingTrigger = existingTriggers.find(
          (t) => t.type === newTrigger.type && t.event === newTrigger.event,
        );

        if (matchingTrigger) {
          conflicts.push({
            type: ConflictType.TRIGGER_CONFLICT,
            severity: 'high',
            message: `Duplicate trigger '${newTrigger.type}:${newTrigger.event}' with ${installed.marketplaceAgent?.displayName}`,
            conflictingAgentId: installed.marketplaceAgentId,
            conflictingAgentName: installed.marketplaceAgent?.displayName || 'Unknown',
            details: {
              triggerType: newTrigger.type,
              triggerEvent: newTrigger.event,
            },
            resolution:
              'Only one agent can handle this trigger. Disable the trigger on one agent.',
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Check for version conflicts with dependencies.
   */
  async checkVersionConflicts(
    marketplaceAgentId: string,
    workspaceId: string,
    targetVersion: string,
  ): Promise<AgentConflict[]> {
    const conflicts: AgentConflict[] = [];

    // Get the marketplace agent
    const agent = await this.marketplaceAgentRepo.findOne({
      where: { id: marketplaceAgentId },
    });

    if (!agent) return conflicts;

    // Check if trying to install an older version
    const currentVersion = agent.latestVersion;
    if (this.compareVersions(targetVersion, currentVersion) < 0) {
      conflicts.push({
        type: ConflictType.VERSION_CONFLICT,
        severity: 'medium',
        message: `Installing older version ${targetVersion} when ${currentVersion} is available`,
        conflictingAgentId: marketplaceAgentId,
        conflictingAgentName: agent.displayName,
        details: {
          targetVersion,
          latestVersion: currentVersion,
        },
        resolution: 'Consider installing the latest version unless compatibility is needed',
      });
    }

    return conflicts;
  }

  /**
   * Get all conflicts for an already installed agent.
   */
  async getInstalledConflicts(
    installedAgentId: string,
  ): Promise<AgentConflict[]> {
    const conflicts: AgentConflict[] = [];

    const installed = await this.installedAgentRepo.findOne({
      where: { id: installedAgentId },
      relations: ['marketplaceAgent'],
    });

    if (!installed || !installed.localDefinitionId) {
      return conflicts;
    }

    const localDef = await this.definitionRepo.findOne({
      where: { id: installed.localDefinitionId },
    });

    if (!localDef) return conflicts;

    const toolConflicts = await this.checkToolPermissionConflicts(
      localDef,
      installed.workspaceId,
      installed.marketplaceAgentId,
      installed.marketplaceAgent?.displayName || 'Unknown',
    );

    const triggerConflicts = await this.checkTriggerConflicts(
      localDef,
      installed.workspaceId,
      installed.marketplaceAgentId,
      installed.marketplaceAgent?.displayName || 'Unknown',
    );

    conflicts.push(...toolConflicts, ...triggerConflicts);

    return conflicts;
  }

  // ---- Private Helpers ----

  private extractToolsFromDefinition(definition: AgentDefinition): string[] {
    const def = definition.definition as Record<string, unknown>;
    if (!def) return [];

    const spec = def.spec as Record<string, unknown> | undefined;
    if (!spec) return [];

    const tools = spec.tools as Record<string, unknown> | undefined;
    if (!tools) return [];

    const allowed = tools.allowed as string[] | undefined;
    return Array.isArray(allowed) ? allowed : [];
  }

  private extractPermissionsFromDefinition(definition: AgentDefinition): string[] {
    const def = definition.definition as Record<string, unknown>;
    if (!def) return [];

    const spec = def.spec as Record<string, unknown> | undefined;
    if (!spec) return [];

    const permissions = spec.permissions as string[] | undefined;
    return Array.isArray(permissions) ? permissions : [];
  }

  private extractTriggersFromDefinition(
    definition: AgentDefinition,
  ): Array<{ type: string; event: string }> {
    const def = definition.definition as Record<string, unknown>;
    if (!def) return [];

    const spec = def.spec as Record<string, unknown> | undefined;
    if (!spec) return [];

    const triggers = spec.triggers as Array<Record<string, unknown>> | undefined;
    if (!triggers || !Array.isArray(triggers)) return [];

    return triggers
      .filter((t) => t.type && t.event)
      .map((t) => ({
        type: String(t.type),
        event: String(t.event),
      }));
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map((p) => parseInt(p, 10) || 0);
    const parts2 = v2.split('.').map((p) => parseInt(p, 10) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }
}
