/**
 * AgentVersionService
 *
 * Story 18-4: Agent Versioning
 *
 * Service for managing agent definition versions.
 * Supports semantic versioning, version snapshots, comparison, and rollback.
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentVersion } from '../../database/entities/agent-version.entity';
import { AgentDefinition } from '../../database/entities/agent-definition.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import {
  AgentDefinitionAuditEventType,
} from '../../database/entities/agent-definition-audit-event.entity';
import { AgentDefinitionAuditService } from './agent-definition-audit.service';
import { CreateAgentVersionDto, VersionIncrementType } from './dto/create-agent-version.dto';
import { ListVersionsQueryDto } from './dto/list-versions-query.dto';
import {
  AgentVersionResponseDto,
  PaginatedVersionListDto,
  VersionDiffResponseDto,
  VersionChangeDto,
} from './dto/agent-version-response.dto';

@Injectable()
export class AgentVersionService {
  private readonly logger = new Logger(AgentVersionService.name);

  constructor(
    @InjectRepository(AgentVersion)
    private readonly versionRepo: Repository<AgentVersion>,
    @InjectRepository(AgentDefinition)
    private readonly definitionRepo: Repository<AgentDefinition>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly auditService: AgentDefinitionAuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a new version from the current agent definition state.
   * Optionally auto-increment version number.
   */
  async createVersion(
    workspaceId: string,
    definitionId: string,
    dto: CreateAgentVersionDto,
    actorId: string,
  ): Promise<AgentVersionResponseDto> {
    // Validate actor has permission
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
    ]);

    // Get the agent definition
    const definition = await this.findDefinitionOrThrow(workspaceId, definitionId);

    // Get existing versions to determine version number and check uniqueness
    const existingVersions = await this.versionRepo.find({
      where: { agentDefinitionId: definitionId },
      order: { createdAt: 'DESC' },
    });

    // Determine the version number
    let versionNumber: string;
    if (dto.version) {
      // Use explicit version from DTO
      versionNumber = dto.version;
      // Check if version already exists
      if (existingVersions.some((v) => v.version === versionNumber)) {
        throw new ConflictException(`Version '${versionNumber}' already exists for this agent definition`);
      }
    } else {
      // Auto-increment version
      const currentVersion = existingVersions.length > 0
        ? existingVersions[0].version
        : definition.version;
      const incrementType = dto.incrementType || VersionIncrementType.PATCH;
      versionNumber = this.incrementVersion(currentVersion, incrementType);

      // Ensure the auto-generated version doesn't exist (unlikely but possible)
      let attempts = 0;
      while (existingVersions.some((v) => v.version === versionNumber) && attempts < 100) {
        // Keep incrementing until we find a unique version
        versionNumber = this.incrementVersion(versionNumber, incrementType);
        attempts++;
      }
      if (attempts >= 100) {
        throw new ConflictException('Unable to generate a unique version number');
      }
    }

    // Validate version is newer than all existing versions
    if (existingVersions.length > 0) {
      this.validateVersionIsNewer(existingVersions, versionNumber);
    }

    // Create snapshot of current definition state
    const snapshot = this.createDefinitionSnapshot(definition);

    // Create and save the version
    const version = this.versionRepo.create({
      agentDefinitionId: definitionId,
      version: versionNumber,
      definitionSnapshot: snapshot,
      changelog: dto.changelog || null,
      isPublished: false,
      publishedAt: null,
      createdBy: actorId,
    });

    const savedVersion = await this.versionRepo.save(version);

    // Log audit event
    await this.auditService.logEvent({
      workspaceId,
      eventType: AgentDefinitionAuditEventType.AGENT_VERSION_CREATED,
      agentDefinitionId: definitionId,
      actorId,
      details: {
        version: versionNumber,
        changelog: dto.changelog,
      },
    });

    // Emit event for marketplace sync (future Story 18-6)
    this.eventEmitter.emit('agent.version.created', {
      workspaceId,
      definitionId,
      versionId: savedVersion.id,
      version: versionNumber,
    });

    return this.toResponseDto(savedVersion);
  }

  /**
   * List all versions for an agent definition with pagination.
   */
  async listVersions(
    workspaceId: string,
    definitionId: string,
    query: ListVersionsQueryDto,
  ): Promise<PaginatedVersionListDto> {
    // Verify definition exists in workspace
    await this.findDefinitionOrThrow(workspaceId, definitionId);

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.versionRepo
      .createQueryBuilder('version')
      .where('version.agentDefinitionId = :definitionId', { definitionId });

    if (query.publishedOnly) {
      qb.andWhere('version.isPublished = :isPublished', { isPublished: true });
    }

    qb.orderBy('version.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => this.toResponseDto(item)),
      total,
      page,
      limit,
    };
  }

  /**
   * Get a specific version by version string.
   */
  async getVersion(
    workspaceId: string,
    definitionId: string,
    version: string,
  ): Promise<AgentVersionResponseDto> {
    // Verify definition exists in workspace
    await this.findDefinitionOrThrow(workspaceId, definitionId);

    const versionEntity = await this.versionRepo.findOne({
      where: { agentDefinitionId: definitionId, version },
    });

    if (!versionEntity) {
      throw new NotFoundException(`Version '${version}' not found for this agent definition`);
    }

    return this.toResponseDto(versionEntity);
  }

  /**
   * Compare two versions and return a diff.
   */
  async compareVersions(
    workspaceId: string,
    definitionId: string,
    fromVersion: string,
    toVersion: string,
  ): Promise<VersionDiffResponseDto> {
    // Verify definition exists in workspace
    await this.findDefinitionOrThrow(workspaceId, definitionId);

    // Get both versions
    const fromVersionEntity = await this.versionRepo.findOne({
      where: { agentDefinitionId: definitionId, version: fromVersion },
    });

    if (!fromVersionEntity) {
      throw new NotFoundException(`Source version '${fromVersion}' not found`);
    }

    const toVersionEntity = await this.versionRepo.findOne({
      where: { agentDefinitionId: definitionId, version: toVersion },
    });

    if (!toVersionEntity) {
      throw new NotFoundException(`Target version '${toVersion}' not found`);
    }

    // Compute diff
    const changes = this.computeDiff(
      fromVersionEntity.definitionSnapshot,
      toVersionEntity.definitionSnapshot,
    );

    // Compute summary
    const summary = {
      added: changes.filter((c) => c.type === 'added').length,
      modified: changes.filter((c) => c.type === 'modified').length,
      removed: changes.filter((c) => c.type === 'removed').length,
    };

    return {
      fromVersion,
      toVersion,
      changes,
      summary,
    };
  }

  /**
   * Publish a version (makes it available to marketplace/installations).
   */
  async publishVersion(
    workspaceId: string,
    definitionId: string,
    version: string,
    actorId: string,
  ): Promise<AgentVersionResponseDto> {
    // Validate actor has permission
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    // Get the version
    const versionEntity = await this.versionRepo.findOne({
      where: { agentDefinitionId: definitionId, version },
    });

    if (!versionEntity) {
      throw new NotFoundException(`Version '${version}' not found`);
    }

    if (versionEntity.isPublished) {
      throw new BadRequestException(`Version '${version}' is already published`);
    }

    // Use transaction to update version and definition
    const savedVersion = await this.dataSource.transaction(async (manager) => {
      // Mark version as published (create a new object to avoid mutating the original)
      const publishedVersion = {
        ...versionEntity,
        isPublished: true,
        publishedAt: new Date(),
      };
      const saved = await manager.save(AgentVersion, publishedVersion);

      // Update latest published version on definition
      await manager.update(AgentDefinition, definitionId, {
        latestPublishedVersion: version,
        isPublished: true,
      });

      return saved;
    });

    // Log audit event
    await this.auditService.logEvent({
      workspaceId,
      eventType: AgentDefinitionAuditEventType.AGENT_VERSION_PUBLISHED,
      agentDefinitionId: definitionId,
      actorId,
      details: { version },
    });

    // Emit event for marketplace sync
    this.eventEmitter.emit('agent.version.published', {
      workspaceId,
      definitionId,
      versionId: savedVersion.id,
      version,
    });

    return this.toResponseDto(savedVersion);
  }

  /**
   * Rollback the agent definition to a specific version.
   * Creates a new version with the content from the target version.
   */
  async rollbackToVersion(
    workspaceId: string,
    definitionId: string,
    targetVersion: string,
    actorId: string,
  ): Promise<AgentVersionResponseDto> {
    // Validate actor has permission
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    // Get the current definition
    const definition = await this.findDefinitionOrThrow(workspaceId, definitionId);

    // Check if trying to rollback to the current version (no-op)
    if (definition.version === targetVersion) {
      throw new BadRequestException(
        `Cannot rollback to version '${targetVersion}' - it is the current version`,
      );
    }

    // Get the target version
    const targetVersionEntity = await this.versionRepo.findOne({
      where: { agentDefinitionId: definitionId, version: targetVersion },
    });

    if (!targetVersionEntity) {
      throw new NotFoundException(`Version '${targetVersion}' not found`);
    }

    // Get existing versions for auto-increment
    const existingVersions = await this.versionRepo.find({
      where: { agentDefinitionId: definitionId },
      order: { createdAt: 'DESC' },
    });

    // Determine new version number for the rollback
    const latestVersion = existingVersions.length > 0
      ? existingVersions[0].version
      : definition.version;
    const newVersion = this.incrementVersion(latestVersion, VersionIncrementType.PATCH);

    // Apply the rollback within a transaction
    const newVersionEntity = await this.dataSource.transaction(async (manager) => {
      // Update the definition with the target version's snapshot
      const snapshot = targetVersionEntity.definitionSnapshot;
      definition.definition = snapshot.definition as any;
      definition.displayName = snapshot.displayName as string;
      definition.description = snapshot.description as string | null;
      definition.category = snapshot.category as any;
      definition.tags = snapshot.tags as string[];
      definition.icon = snapshot.icon as string;
      definition.version = newVersion;

      await manager.save(definition);

      // Create a new version entry for the rollback
      const rollbackVersion = manager.create(AgentVersion, {
        agentDefinitionId: definitionId,
        version: newVersion,
        definitionSnapshot: targetVersionEntity.definitionSnapshot,
        changelog: `Rollback to version ${targetVersion}`,
        isPublished: false,
        publishedAt: null,
        createdBy: actorId,
      });

      return manager.save(rollbackVersion);
    });

    // Log audit event
    await this.auditService.logEvent({
      workspaceId,
      eventType: AgentDefinitionAuditEventType.AGENT_VERSION_ROLLBACK,
      agentDefinitionId: definitionId,
      actorId,
      details: {
        targetVersion,
        newVersion,
      },
    });

    // Emit event
    this.eventEmitter.emit('agent.version.rollback', {
      workspaceId,
      definitionId,
      versionId: newVersionEntity.id,
      targetVersion,
      newVersion,
    });

    return this.toResponseDto(newVersionEntity);
  }

  /**
   * Get the latest published version for an agent.
   */
  async getLatestPublishedVersion(
    definitionId: string,
  ): Promise<AgentVersion | null> {
    return this.versionRepo.findOne({
      where: { agentDefinitionId: definitionId, isPublished: true },
      order: { publishedAt: 'DESC' },
    });
  }

  // ---- Private Helper Methods ----

  private async findDefinitionOrThrow(
    workspaceId: string,
    definitionId: string,
  ): Promise<AgentDefinition> {
    const definition = await this.definitionRepo.findOne({
      where: { id: definitionId, workspaceId },
    });
    if (!definition) {
      throw new NotFoundException('Agent definition not found');
    }
    return definition;
  }

  private async validateMemberRole(
    workspaceId: string,
    userId: string,
    allowedRoles: WorkspaceRole[],
  ): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { workspaceId, userId },
    });

    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action in this workspace',
      );
    }
  }

  /**
   * Auto-increment version number based on semver rules.
   * Handles pre-release versions correctly.
   */
  private incrementVersion(
    currentVersion: string,
    incrementType: VersionIncrementType,
  ): string {
    // Handle pre-release versions - strip the pre-release part first
    const baseVersion = currentVersion.split('-')[0];
    const [major, minor, patch] = baseVersion.split('.').map(Number);

    switch (incrementType) {
      case VersionIncrementType.MAJOR:
        return `${major + 1}.0.0`;
      case VersionIncrementType.MINOR:
        return `${major}.${minor + 1}.0`;
      case VersionIncrementType.PATCH:
      default:
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  /**
   * Validate version is greater than all existing versions.
   * Uses semver comparison.
   */
  private validateVersionIsNewer(
    existingVersions: AgentVersion[],
    newVersion: string,
  ): void {
    const sortedVersions = [...existingVersions].sort((a, b) =>
      this.compareVersionsSemver(b.version, a.version),
    );

    const latestVersion = sortedVersions[0]?.version;
    if (latestVersion && this.compareVersionsSemver(newVersion, latestVersion) <= 0) {
      throw new BadRequestException(
        `Version '${newVersion}' must be greater than the latest version '${latestVersion}'`,
      );
    }
  }

  /**
   * Compare two semver version strings.
   * Returns: -1 if a < b, 0 if a === b, 1 if a > b
   */
  private compareVersionsSemver(a: string, b: string): number {
    // Strip pre-release for comparison
    const parseVersion = (v: string): [number, number, number, string | null] => {
      const [main, pre] = v.split('-');
      const [major, minor, patch] = main.split('.').map(Number);
      return [major, minor, patch, pre || null];
    };

    const [aMajor, aMinor, aPatch, aPre] = parseVersion(a);
    const [bMajor, bMinor, bPatch, bPre] = parseVersion(b);

    if (aMajor !== bMajor) return aMajor - bMajor;
    if (aMinor !== bMinor) return aMinor - bMinor;
    if (aPatch !== bPatch) return aPatch - bPatch;

    // Pre-release versions have lower precedence
    if (aPre === null && bPre !== null) return 1;
    if (aPre !== null && bPre === null) return -1;
    if (aPre !== null && bPre !== null) {
      return aPre.localeCompare(bPre);
    }

    return 0;
  }

  /**
   * Create a complete snapshot of the agent definition for versioning.
   */
  private createDefinitionSnapshot(definition: AgentDefinition): Record<string, unknown> {
    return {
      name: definition.name,
      displayName: definition.displayName,
      description: definition.description,
      version: definition.version,
      schemaVersion: definition.schemaVersion,
      definition: definition.definition,
      icon: definition.icon,
      category: definition.category,
      tags: definition.tags,
    };
  }

  /**
   * Compute diff between two definition snapshots.
   * Returns an array of changes with path, type, and values.
   * Uses a WeakSet to prevent infinite recursion from circular references.
   */
  private computeDiff(
    fromSnapshot: Record<string, unknown>,
    toSnapshot: Record<string, unknown>,
    basePath: string = '',
    seen: WeakSet<object> = new WeakSet(),
  ): VersionChangeDto[] {
    const changes: VersionChangeDto[] = [];

    // Check for circular references
    if (seen.has(fromSnapshot) || seen.has(toSnapshot)) {
      return changes;
    }

    // Add snapshots to seen set
    seen.add(fromSnapshot);
    seen.add(toSnapshot);

    // Get all unique keys from both snapshots
    const allKeys = new Set([
      ...Object.keys(fromSnapshot),
      ...Object.keys(toSnapshot),
    ]);

    for (const key of allKeys) {
      const path = basePath ? `${basePath}.${key}` : key;
      const fromValue = fromSnapshot[key];
      const toValue = toSnapshot[key];

      if (fromValue === undefined && toValue !== undefined) {
        // Added
        changes.push({
          path,
          type: 'added',
          newValue: toValue,
        });
      } else if (fromValue !== undefined && toValue === undefined) {
        // Removed
        changes.push({
          path,
          type: 'removed',
          oldValue: fromValue,
        });
      } else if (fromValue !== toValue) {
        // Check if both are objects (and not null)
        if (
          typeof fromValue === 'object' && fromValue !== null &&
          typeof toValue === 'object' && toValue !== null &&
          !Array.isArray(fromValue) && !Array.isArray(toValue)
        ) {
          // Recursively diff nested objects
          changes.push(...this.computeDiff(
            fromValue as Record<string, unknown>,
            toValue as Record<string, unknown>,
            path,
            seen,
          ));
        } else if (Array.isArray(fromValue) && Array.isArray(toValue)) {
          // Compare arrays by JSON stringification
          if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
            changes.push({
              path,
              type: 'modified',
              oldValue: fromValue,
              newValue: toValue,
            });
          }
        } else {
          // Modified primitive or different types
          changes.push({
            path,
            type: 'modified',
            oldValue: fromValue,
            newValue: toValue,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Map entity to response DTO.
   */
  private toResponseDto(entity: AgentVersion): AgentVersionResponseDto {
    const dto = new AgentVersionResponseDto();
    dto.id = entity.id;
    dto.agentDefinitionId = entity.agentDefinitionId;
    dto.version = entity.version;
    dto.definitionSnapshot = entity.definitionSnapshot;
    dto.changelog = entity.changelog || undefined;
    dto.isPublished = entity.isPublished;
    dto.publishedAt = entity.publishedAt || undefined;
    dto.createdBy = entity.createdBy;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
