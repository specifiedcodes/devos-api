/**
 * AgentDependencyService
 *
 * Story 18-8: Agent Installation Flow
 *
 * Service for checking and resolving agent dependencies during installation.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MarketplaceAgent } from '../../database/entities/marketplace-agent.entity';
import { InstalledAgent } from '../../database/entities/installed-agent.entity';
import { AgentDefinition } from '../../database/entities/agent-definition.entity';

export interface AgentDependency {
  agentName: string;
  versionRange: string; // semver range like "^1.0.0" or ">=2.0.0 <3.0.0"
  isRequired: boolean;
  description?: string;
}

export interface InstalledDependency {
  dependency: AgentDependency;
  installedVersion: string;
}

export interface DependencyConflict {
  dependency: AgentDependency;
  reason: string;
  conflictingAgent: string;
}

export interface DependencyCheckResult {
  canInstall: boolean;
  missingDependencies: AgentDependency[];
  installedDependencies: InstalledDependency[];
  conflicts: DependencyConflict[];
  suggestions: string[];
}

export interface ToolCompatibilityResult {
  isCompatible: boolean;
  availableTools: string[];
  missingTools: string[];
  toolConflicts: Array<{
    tool: string;
    usedBy: string[];
  }>;
}

@Injectable()
export class AgentDependencyService {
  private readonly logger = new Logger(AgentDependencyService.name);

  constructor(
    @InjectRepository(MarketplaceAgent)
    private readonly marketplaceAgentRepo: Repository<MarketplaceAgent>,
    @InjectRepository(InstalledAgent)
    private readonly installedAgentRepo: Repository<InstalledAgent>,
    @InjectRepository(AgentDefinition)
    private readonly definitionRepo: Repository<AgentDefinition>,
  ) {}

  /**
   * Check if an agent's dependencies can be satisfied in a workspace.
   */
  async checkDependencies(
    marketplaceAgentId: string,
    workspaceId: string,
  ): Promise<DependencyCheckResult> {
    this.logger.debug(
      `Checking dependencies for agent ${marketplaceAgentId} in workspace ${workspaceId}`,
    );

    // Get the marketplace agent and its definition
    const marketplaceAgent = await this.marketplaceAgentRepo.findOne({
      where: { id: marketplaceAgentId },
    });

    if (!marketplaceAgent) {
      return {
        canInstall: false,
        missingDependencies: [],
        installedDependencies: [],
        conflicts: [
          {
            dependency: { agentName: '', versionRange: '', isRequired: true },
            reason: 'Agent not found in marketplace',
            conflictingAgent: '',
          },
        ],
        suggestions: ['Verify the agent exists in the marketplace'],
      };
    }

    // Get the agent definition
    const definition = await this.definitionRepo.findOne({
      where: { id: marketplaceAgent.agentDefinitionId },
    });

    if (!definition) {
      return {
        canInstall: false,
        missingDependencies: [],
        installedDependencies: [],
        conflicts: [
          {
            dependency: { agentName: '', versionRange: '', isRequired: true },
            reason: 'Agent definition not found',
            conflictingAgent: '',
          },
        ],
        suggestions: ['The agent definition may have been deleted'],
      };
    }

    // Parse dependencies from the definition
    const dependencies = this.parseDependencies(definition);
    const missingDependencies: AgentDependency[] = [];
    const installedDependencies: InstalledDependency[] = [];
    const conflicts: DependencyConflict[] = [];
    const suggestions: string[] = [];

    // Get all installed agents in the workspace
    const installedAgents = await this.installedAgentRepo.find({
      where: { workspaceId },
      relations: ['marketplaceAgent'],
    });

    // Check each dependency
    for (const dep of dependencies) {
      // Find if the dependency is already installed
      const installedDep = installedAgents.find(
        (ia) => ia.marketplaceAgent?.name === dep.agentName,
      );

      if (installedDep && installedDep.marketplaceAgent) {
        const installedVersion = installedDep.installedVersion;

        // Check if installed version satisfies the required range
        if (this.satisfiesVersion(installedVersion, dep.versionRange)) {
          installedDependencies.push({
            dependency: dep,
            installedVersion,
          });
        } else {
          // Version conflict
          conflicts.push({
            dependency: dep,
            reason: `Installed version ${installedVersion} does not satisfy required range ${dep.versionRange}`,
            conflictingAgent: dep.agentName,
          });

          if (dep.isRequired) {
            suggestions.push(
              `Update ${dep.agentName} to a version matching ${dep.versionRange}`,
            );
          }
        }
      } else {
        // Dependency not installed
        if (dep.isRequired) {
          missingDependencies.push(dep);
        }
      }
    }

    // Determine if installation can proceed
    const hasMissingRequired = missingDependencies.some((d) => d.isRequired);
    const hasBlockingConflicts = conflicts.some((c) => c.dependency.isRequired);

    // Generate suggestions for missing dependencies
    for (const missing of missingDependencies) {
      suggestions.push(
        `Install ${missing.agentName} (${missing.versionRange}) - ${missing.description || 'Required dependency'}`,
      );
    }

    return {
      canInstall: !hasMissingRequired && !hasBlockingConflicts,
      missingDependencies,
      installedDependencies,
      conflicts,
      suggestions,
    };
  }

  /**
   * Check tool compatibility between agents in a workspace.
   * Detects potential conflicts where multiple agents request same tools.
   */
  async checkToolCompatibility(
    marketplaceAgentId: string,
    workspaceId: string,
  ): Promise<ToolCompatibilityResult> {
    this.logger.debug(
      `Checking tool compatibility for agent ${marketplaceAgentId} in workspace ${workspaceId}`,
    );

    // Get the marketplace agent and its definition
    const marketplaceAgent = await this.marketplaceAgentRepo.findOne({
      where: { id: marketplaceAgentId },
    });

    if (!marketplaceAgent) {
      return {
        isCompatible: false,
        availableTools: [],
        missingTools: [],
        toolConflicts: [],
      };
    }

    const definition = await this.definitionRepo.findOne({
      where: { id: marketplaceAgent.agentDefinitionId },
    });

    if (!definition) {
      return {
        isCompatible: false,
        availableTools: [],
        missingTools: [],
        toolConflicts: [],
      };
    }

    // Extract tools from the definition
    const newAgentTools = this.extractToolsFromDefinition(definition);

    // Get all installed agents and their tools
    const installedAgents = await this.installedAgentRepo.find({
      where: { workspaceId },
      relations: ['marketplaceAgent'],
    });

    const toolUsageMap = new Map<string, string[]>();

    // Collect tool usage from installed agents
    for (const installed of installedAgents) {
      if (installed.localDefinitionId) {
        const localDef = await this.definitionRepo.findOne({
          where: { id: installed.localDefinitionId },
        });
        if (localDef) {
          const tools = this.extractToolsFromDefinition(localDef);
          for (const tool of tools) {
            const users = toolUsageMap.get(tool) || [];
            users.push(installed.marketplaceAgent?.displayName || 'Unknown');
            toolUsageMap.set(tool, users);
          }
        }
      }
    }

    // Check for conflicts with new agent's tools
    const toolConflicts: Array<{ tool: string; usedBy: string[] }> = [];
    for (const tool of newAgentTools) {
      const existingUsers = toolUsageMap.get(tool) || [];
      if (existingUsers.length > 0) {
        toolConflicts.push({
          tool,
          usedBy: [...existingUsers, marketplaceAgent.displayName],
        });
      }
    }

    // Available tools are all unique tools
    const availableTools = [
      ...new Set([...newAgentTools, ...Array.from(toolUsageMap.keys())]),
    ];

    return {
      isCompatible: toolConflicts.length === 0,
      availableTools,
      missingTools: [],
      toolConflicts,
    };
  }

  /**
   * Resolve and install dependencies for an agent.
   * Only installs required dependencies that are not already installed.
   * Note: This is a placeholder for auto-installation of dependencies.
   */
  async resolveAndInstallDependencies(
    _marketplaceAgentId: string,
    _workspaceId: string,
    _actorId: string,
  ): Promise<InstalledAgent[]> {
    this.logger.debug('Auto-installation of dependencies is not yet implemented');
    // This would require recursive installation and is out of scope
    // for the current implementation
    return [];
  }

  /**
   * Parse dependency declarations from agent definition.
   */
  parseDependencies(definition: AgentDefinition): AgentDependency[] {
    const dependencies: AgentDependency[] = [];

    // Parse from definition YAML/JSON structure
    const def = definition.definition as unknown as Record<string, unknown>;
    if (!def) return dependencies;

    const spec = def.spec as Record<string, unknown> | undefined;
    if (!spec) return dependencies;

    const deps = spec.dependencies as Array<Record<string, unknown>> | undefined;
    if (!deps || !Array.isArray(deps)) return dependencies;

    for (const dep of deps) {
      if (dep.name && typeof dep.name === 'string') {
        dependencies.push({
          agentName: dep.name,
          versionRange: typeof dep.version === 'string' ? dep.version : '*',
          isRequired: dep.required !== false,
          description: typeof dep.description === 'string' ? dep.description : undefined,
        });
      }
    }

    return dependencies;
  }

  /**
   * Check if a version satisfies a semver range.
   * Supports basic semver patterns: exact, ^, ~, >=, <, etc.
   */
  satisfiesVersion(version: string, range: string): boolean {
    // Simple semver comparison - for full support use 'semver' package
    if (range === '*' || range === '') return true;
    if (version === range) return true;

    // Handle compound ranges like ">=1.0.0 <2.0.0" FIRST
    // This must be before the single operator checks
    if (range.includes(' ')) {
      const parts = range.split(' ').filter((p) => p.trim());
      return parts.every((part) => this.satisfiesVersion(version, part));
    }

    // Parse caret ranges (^1.2.3)
    if (range.startsWith('^')) {
      const targetVersion = range.slice(1);
      return this.satisfiesCaretRange(version, targetVersion);
    }

    // Parse tilde ranges (~1.2.3)
    if (range.startsWith('~')) {
      const targetVersion = range.slice(1);
      return this.compareMajorMinorPatch(version, targetVersion);
    }

    // Parse comparison operators
    if (range.startsWith('>=')) {
      const targetVersion = range.slice(2).trim();
      return this.compareVersions(version, targetVersion) >= 0;
    }

    if (range.startsWith('>')) {
      const targetVersion = range.slice(1).trim();
      return this.compareVersions(version, targetVersion) > 0;
    }

    if (range.startsWith('<=')) {
      const targetVersion = range.slice(2).trim();
      return this.compareVersions(version, targetVersion) <= 0;
    }

    if (range.startsWith('<')) {
      const targetVersion = range.slice(1).trim();
      return this.compareVersions(version, targetVersion) < 0;
    }

    // Exact match fallback
    return version === range;
  }

  /**
   * Get all agents that depend on a specific agent.
   */
  async getDependents(
    marketplaceAgentId: string,
    workspaceId: string,
  ): Promise<Array<{ agentName: string; installedVersion: string }>> {
    const dependents: Array<{ agentName: string; installedVersion: string }> = [];

    // Get the target agent's name
    const targetAgent = await this.marketplaceAgentRepo.findOne({
      where: { id: marketplaceAgentId },
    });

    if (!targetAgent) return dependents;

    // Get all installed agents in the workspace
    const installedAgents = await this.installedAgentRepo.find({
      where: { workspaceId },
      relations: ['marketplaceAgent'],
    });

    // Check each installed agent's dependencies
    for (const installed of installedAgents) {
      if (installed.localDefinitionId) {
        const localDef = await this.definitionRepo.findOne({
          where: { id: installed.localDefinitionId },
        });
        if (localDef) {
          const deps = this.parseDependencies(localDef);
          const hasDependency = deps.some(
            (d) => d.agentName === targetAgent.name,
          );
          if (hasDependency && installed.marketplaceAgent) {
            dependents.push({
              agentName: installed.marketplaceAgent.displayName,
              installedVersion: installed.installedVersion,
            });
          }
        }
      }
    }

    return dependents;
  }

  // ---- Private Helpers ----

  private satisfiesCaretRange(version: string, target: string): boolean {
    const vParts = version.split('.').map((p) => parseInt(p, 10) || 0);
    const tParts = target.split('.').map((p) => parseInt(p, 10) || 0);

    // Major version must match exactly
    if (vParts[0] !== tParts[0]) return false;

    // Version must be >= target for caret to be satisfied
    // e.g., ^1.0.0 matches 1.0.0, 1.1.0, 1.2.0, etc. but NOT 2.0.0
    return this.compareVersions(version, target) >= 0;
  }

  private extractToolsFromDefinition(definition: AgentDefinition): string[] {
    const def = definition.definition as unknown as Record<string, unknown>;
    if (!def) return [];

    const spec = def.spec as Record<string, unknown> | undefined;
    if (!spec) return [];

    const tools = spec.tools as Record<string, unknown> | undefined;
    if (!tools) return [];

    const allowed = tools.allowed as string[] | undefined;
    return Array.isArray(allowed) ? allowed : [];
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

  private compareMajorMinor(version: string, target: string): boolean {
    const vParts = version.split('.').map((p) => parseInt(p, 10) || 0);
    const tParts = target.split('.').map((p) => parseInt(p, 10) || 0);

    // Major version must match exactly
    if (vParts[0] !== tParts[0]) return false;

    // Version must be >= target for caret to be satisfied
    // e.g., ^1.0.0 matches 1.0.0, 1.1.0, 1.2.0, etc. but NOT 2.0.0
    return this.compareVersions(version, target) >= 0;
  }

  private compareMajorMinorPatch(version: string, target: string): boolean {
    const vParts = version.split('.').map((p) => parseInt(p, 10) || 0);
    const tParts = target.split('.').map((p) => parseInt(p, 10) || 0);

    // Major and minor version must match
    if (vParts[0] !== tParts[0] || vParts[1] !== tParts[1]) return false;

    // Patch version must be >= target
    return (vParts[2] || 0) >= (tParts[2] || 0);
  }
}
