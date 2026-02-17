/**
 * CustomAgentsService
 *
 * Story 18-1: Agent Definition Schema
 *
 * CRUD operations for custom agent definitions with validation,
 * audit logging, and YAML/JSON import/export support.
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
import { Repository } from 'typeorm';
import * as yaml from 'js-yaml';
import { AgentDefinition, AgentDefinitionCategory, AgentDefinitionSpec } from '../../database/entities/agent-definition.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { AgentDefinitionAuditEventType } from '../../database/entities/agent-definition-audit-event.entity';
import { AgentDefinitionValidatorService } from './agent-definition-validator.service';
import { AgentDefinitionAuditService } from './agent-definition-audit.service';
import { CreateAgentDefinitionDto } from './dto/create-agent-definition.dto';
import { UpdateAgentDefinitionDto } from './dto/update-agent-definition.dto';
import { ValidateAgentDefinitionDto } from './dto/validate-agent-definition.dto';
import { AgentDefinitionResponseDto, AgentDefinitionValidationResponseDto } from './dto/agent-definition-response.dto';
import { ListAgentDefinitionsQueryDto } from './dto/list-agent-definitions-query.dto';
import { AgentDefinitionListResult } from './interfaces/agent-definition.interfaces';
import { AGENT_DEFINITION_CONSTANTS } from './constants/agent-definition.constants';

@Injectable()
export class CustomAgentsService {
  private readonly logger = new Logger(CustomAgentsService.name);

  constructor(
    @InjectRepository(AgentDefinition)
    private readonly agentDefinitionRepository: Repository<AgentDefinition>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    private readonly validatorService: AgentDefinitionValidatorService,
    private readonly auditService: AgentDefinitionAuditService,
  ) {}

  /**
   * Create a new agent definition.
   */
  async createDefinition(
    workspaceId: string,
    dto: CreateAgentDefinitionDto,
    actorId: string,
  ): Promise<AgentDefinitionResponseDto> {
    // Validate actor is workspace member with sufficient role
    await this.validateMemberRole(workspaceId, actorId, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
      WorkspaceRole.DEVELOPER,
    ]);

    // Check workspace definition count limit
    const count = await this.agentDefinitionRepository.count({ where: { workspaceId } });
    if (count >= AGENT_DEFINITION_CONSTANTS.MAX_DEFINITIONS_PER_WORKSPACE) {
      throw new BadRequestException(
        `Workspace has reached the maximum of ${AGENT_DEFINITION_CONSTANTS.MAX_DEFINITIONS_PER_WORKSPACE} agent definitions`,
      );
    }

    // Check name uniqueness within workspace
    const existing = await this.agentDefinitionRepository.findOne({
      where: { workspaceId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Agent definition with name '${dto.name}' already exists in this workspace`,
      );
    }

    // Validate definition against JSON Schema
    const validationResult = this.validatorService.validateDefinition(dto.definition);
    if (!validationResult.valid) {
      await this.auditService.logEvent({
        workspaceId,
        eventType: AgentDefinitionAuditEventType.AGENT_DEF_VALIDATION_FAILED,
        actorId,
        details: { errors: validationResult.errors, name: dto.name },
      });
      throw new BadRequestException({
        message: 'Agent definition validation failed',
        errors: validationResult.errors,
      });
    }

    // Validate model references
    const modelErrors = await this.validatorService.validateModelReferences(dto.definition);
    if (modelErrors.length > 0) {
      throw new BadRequestException({
        message: 'Agent definition model reference validation failed',
        errors: modelErrors,
      });
    }

    // Sanitize tags
    const tags = this.sanitizeTags(dto.tags);

    // Save to database
    const entity = this.agentDefinitionRepository.create({
      workspaceId,
      name: dto.name,
      displayName: dto.displayName,
      description: dto.description || null,
      version: dto.version || '1.0.0',
      schemaVersion: AGENT_DEFINITION_CONSTANTS.CURRENT_SCHEMA_VERSION,
      definition: dto.definition as unknown as AgentDefinitionSpec,
      icon: dto.icon || 'bot',
      category: dto.category as AgentDefinitionCategory,
      tags,
      isPublished: false,
      isActive: true,
      createdBy: actorId,
    });

    const saved = await this.agentDefinitionRepository.save(entity);

    // Log audit event
    await this.auditService.logEvent({
      workspaceId,
      eventType: AgentDefinitionAuditEventType.AGENT_DEF_CREATED,
      agentDefinitionId: saved.id,
      actorId,
      details: { name: saved.name, category: saved.category },
    });

    return this.toResponseDto(saved);
  }

  /**
   * Update an existing agent definition.
   */
  async updateDefinition(
    workspaceId: string,
    definitionId: string,
    dto: UpdateAgentDefinitionDto,
    actorId: string,
  ): Promise<AgentDefinitionResponseDto> {
    const entity = await this.findDefinitionOrThrow(workspaceId, definitionId);

    // Validate actor is workspace admin/owner or is the creator
    await this.validateMemberRoleOrCreator(workspaceId, actorId, entity.createdBy, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    // If definition field is provided, validate it
    if (dto.definition) {
      const validationResult = this.validatorService.validateDefinition(dto.definition);
      if (!validationResult.valid) {
        await this.auditService.logEvent({
          workspaceId,
          eventType: AgentDefinitionAuditEventType.AGENT_DEF_VALIDATION_FAILED,
          agentDefinitionId: definitionId,
          actorId,
          details: { errors: validationResult.errors },
        });
        throw new BadRequestException({
          message: 'Agent definition validation failed',
          errors: validationResult.errors,
        });
      }

      const modelErrors = await this.validatorService.validateModelReferences(dto.definition);
      if (modelErrors.length > 0) {
        throw new BadRequestException({
          message: 'Agent definition model reference validation failed',
          errors: modelErrors,
        });
      }
    }

    // Track changed fields for audit
    const changedFields: string[] = [];

    if (dto.displayName !== undefined) {
      entity.displayName = dto.displayName;
      changedFields.push('displayName');
    }
    if (dto.description !== undefined) {
      entity.description = dto.description || null;
      changedFields.push('description');
    }
    if (dto.version !== undefined) {
      entity.version = dto.version;
      changedFields.push('version');
    }
    if (dto.definition !== undefined) {
      entity.definition = dto.definition as unknown as AgentDefinitionSpec;
      changedFields.push('definition');
    }
    if (dto.icon !== undefined) {
      entity.icon = dto.icon;
      changedFields.push('icon');
    }
    if (dto.category !== undefined) {
      entity.category = dto.category as AgentDefinitionCategory;
      changedFields.push('category');
    }
    if (dto.tags !== undefined) {
      entity.tags = this.sanitizeTags(dto.tags);
      changedFields.push('tags');
    }

    const updated = await this.agentDefinitionRepository.save(entity);

    // Log audit event with changed fields
    await this.auditService.logEvent({
      workspaceId,
      eventType: AgentDefinitionAuditEventType.AGENT_DEF_UPDATED,
      agentDefinitionId: definitionId,
      actorId,
      details: { changedFields },
    });

    return this.toResponseDto(updated);
  }

  /**
   * Delete an agent definition.
   */
  async deleteDefinition(
    workspaceId: string,
    definitionId: string,
    actorId: string,
  ): Promise<void> {
    const entity = await this.findDefinitionOrThrow(workspaceId, definitionId);

    // Validate actor is workspace admin/owner or is the creator
    await this.validateMemberRoleOrCreator(workspaceId, actorId, entity.createdBy, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    // Capture snapshot for audit
    const snapshot = this.toResponseDto(entity);

    await this.agentDefinitionRepository.remove(entity);

    // Log audit event with definition snapshot
    await this.auditService.logEvent({
      workspaceId,
      eventType: AgentDefinitionAuditEventType.AGENT_DEF_DELETED,
      actorId,
      details: { deletedDefinition: snapshot as unknown as Record<string, unknown> },
    });
  }

  /**
   * Get a single agent definition.
   */
  async getDefinition(
    workspaceId: string,
    definitionId: string,
  ): Promise<AgentDefinitionResponseDto> {
    const entity = await this.findDefinitionOrThrow(workspaceId, definitionId);
    return this.toResponseDto(entity);
  }

  /**
   * List agent definitions with filtering and pagination.
   */
  async listDefinitions(
    workspaceId: string,
    query: ListAgentDefinitionsQueryDto,
  ): Promise<AgentDefinitionListResult> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.agentDefinitionRepository
      .createQueryBuilder('def')
      .where('def.workspaceId = :workspaceId', { workspaceId });

    if (query.category) {
      qb.andWhere('def.category = :category', { category: query.category });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('def.isActive = :isActive', { isActive: query.isActive });
    }

    if (query.isPublished !== undefined) {
      qb.andWhere('def.isPublished = :isPublished', { isPublished: query.isPublished });
    }

    if (query.search) {
      // Escape ILIKE wildcards to prevent injection
      const escaped = query.search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      qb.andWhere(
        '(def.name ILIKE :search OR def.display_name ILIKE :search)',
        { search: `%${escaped}%` },
      );
    }

    if (query.tag) {
      qb.andWhere('def.tags @> :tag', { tag: [query.tag] });
    }

    if (query.createdBy) {
      qb.andWhere('def.createdBy = :createdBy', { createdBy: query.createdBy });
    }

    // Sorting
    const sortField = this.getSortColumn(query.sortBy || 'createdAt');
    const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(sortField, sortOrder);

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
   * Activate an agent definition.
   */
  async activateDefinition(
    workspaceId: string,
    definitionId: string,
    actorId: string,
  ): Promise<AgentDefinitionResponseDto> {
    const entity = await this.findDefinitionOrThrow(workspaceId, definitionId);

    // Validate actor has permission to activate
    await this.validateMemberRoleOrCreator(workspaceId, actorId, entity.createdBy, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    entity.isActive = true;
    const updated = await this.agentDefinitionRepository.save(entity);

    await this.auditService.logEvent({
      workspaceId,
      eventType: AgentDefinitionAuditEventType.AGENT_DEF_ACTIVATED,
      agentDefinitionId: definitionId,
      actorId,
    });

    return this.toResponseDto(updated);
  }

  /**
   * Deactivate an agent definition.
   */
  async deactivateDefinition(
    workspaceId: string,
    definitionId: string,
    actorId: string,
  ): Promise<AgentDefinitionResponseDto> {
    const entity = await this.findDefinitionOrThrow(workspaceId, definitionId);

    // Validate actor has permission to deactivate
    await this.validateMemberRoleOrCreator(workspaceId, actorId, entity.createdBy, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    entity.isActive = false;
    const updated = await this.agentDefinitionRepository.save(entity);

    await this.auditService.logEvent({
      workspaceId,
      eventType: AgentDefinitionAuditEventType.AGENT_DEF_DEACTIVATED,
      agentDefinitionId: definitionId,
      actorId,
    });

    return this.toResponseDto(updated);
  }

  /**
   * Validate a definition without saving (pure validation endpoint).
   */
  async validateDefinition(
    dto: ValidateAgentDefinitionDto,
  ): Promise<AgentDefinitionValidationResponseDto> {
    const result = this.validatorService.validateDefinition(
      dto.definition,
      dto.schemaVersion,
    );

    // Also validate model references
    const modelErrors = await this.validatorService.validateModelReferences(dto.definition);

    const allErrors = [...result.errors, ...modelErrors];

    return {
      valid: allErrors.length === 0,
      errors: allErrors.map((e) => ({
        path: e.path,
        message: e.message,
        keyword: e.keyword,
      })),
      warnings: result.warnings.map((w) => ({
        path: w.path,
        message: w.message,
        type: w.type,
      })),
    };
  }

  /**
   * Export a definition as YAML string.
   */
  async exportDefinitionAsYaml(
    workspaceId: string,
    definitionId: string,
  ): Promise<string> {
    const entity = await this.findDefinitionOrThrow(workspaceId, definitionId);

    const exportObj = {
      apiVersion: 'devos.com/v1',
      kind: 'AgentDefinition',
      metadata: {
        name: entity.name,
        display_name: entity.displayName,
        description: entity.description,
        version: entity.version,
        tags: entity.tags,
        icon: entity.icon,
        category: entity.category,
      },
      spec: entity.definition,
    };

    return yaml.dump(exportObj, { lineWidth: -1, noRefs: true });
  }

  /**
   * Export a definition as JSON string.
   */
  async exportDefinitionAsJson(
    workspaceId: string,
    definitionId: string,
  ): Promise<string> {
    const entity = await this.findDefinitionOrThrow(workspaceId, definitionId);

    const exportObj = {
      apiVersion: 'devos.com/v1',
      kind: 'AgentDefinition',
      metadata: {
        name: entity.name,
        display_name: entity.displayName,
        description: entity.description,
        version: entity.version,
        tags: entity.tags,
        icon: entity.icon,
        category: entity.category,
      },
      spec: entity.definition,
    };

    return JSON.stringify(exportObj, null, 2);
  }

  /**
   * Import a definition from YAML string.
   */
  async importDefinitionFromYaml(
    workspaceId: string,
    yamlString: string,
    actorId: string,
  ): Promise<AgentDefinitionResponseDto> {
    let parsed: Record<string, unknown>;
    try {
      parsed = yaml.load(yamlString) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid YAML format');
    }

    return this.importFromParsed(workspaceId, parsed, actorId);
  }

  /**
   * Import a definition from JSON string.
   */
  async importDefinitionFromJson(
    workspaceId: string,
    jsonString: string,
    actorId: string,
  ): Promise<AgentDefinitionResponseDto> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonString) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid JSON format');
    }

    return this.importFromParsed(workspaceId, parsed, actorId);
  }

  /**
   * Map entity to response DTO.
   */
  toResponseDto(entity: AgentDefinition): AgentDefinitionResponseDto {
    const dto = new AgentDefinitionResponseDto();
    dto.id = entity.id;
    dto.workspaceId = entity.workspaceId;
    dto.name = entity.name;
    dto.displayName = entity.displayName;
    dto.description = entity.description;
    dto.version = entity.version;
    dto.schemaVersion = entity.schemaVersion;
    dto.definition = entity.definition as unknown as Record<string, unknown>;
    dto.icon = entity.icon;
    dto.category = entity.category;
    dto.tags = entity.tags;
    dto.isPublished = entity.isPublished;
    dto.isActive = entity.isActive;
    dto.createdBy = entity.createdBy;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }

  // ---- Private Helpers ----

  private async findDefinitionOrThrow(
    workspaceId: string,
    definitionId: string,
  ): Promise<AgentDefinition> {
    const entity = await this.agentDefinitionRepository.findOne({
      where: { id: definitionId, workspaceId },
    });
    if (!entity) {
      throw new NotFoundException(`Agent definition not found`);
    }
    return entity;
  }

  private async validateMemberRole(
    workspaceId: string,
    userId: string,
    allowedRoles: WorkspaceRole[],
  ): Promise<void> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId },
    });

    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action in this workspace',
      );
    }
  }

  private async validateMemberRoleOrCreator(
    workspaceId: string,
    userId: string,
    creatorId: string,
    adminRoles: WorkspaceRole[],
  ): Promise<void> {
    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId },
    });

    if (!member) {
      throw new ForbiddenException(
        'You do not have permission to perform this action in this workspace',
      );
    }

    // Allow if user is the creator or has admin/owner role
    if (userId !== creatorId && !adminRoles.includes(member.role)) {
      throw new ForbiddenException(
        'You do not have permission to modify this agent definition',
      );
    }
  }

  private sanitizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    const sanitized = tags
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0 && tag.length <= AGENT_DEFINITION_CONSTANTS.MAX_TAG_LENGTH);
    // Deduplicate
    return [...new Set(sanitized)];
  }

  private getSortColumn(sortBy: string): string {
    const sortMap: Record<string, string> = {
      createdAt: 'def.created_at',
      updatedAt: 'def.updated_at',
      name: 'def.name',
      displayName: 'def.display_name',
    };
    return sortMap[sortBy] || 'def.created_at';
  }

  private async importFromParsed(
    workspaceId: string,
    parsed: Record<string, unknown>,
    actorId: string,
  ): Promise<AgentDefinitionResponseDto> {
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException('Invalid import format: expected an object');
    }

    // Validate apiVersion and kind - sanitize user input in error messages
    if (parsed.apiVersion !== 'devos.com/v1') {
      const sanitizedVersion = String(parsed.apiVersion ?? '').slice(0, 100);
      throw new BadRequestException(
        `Invalid apiVersion '${sanitizedVersion}'. Expected 'devos.com/v1'`,
      );
    }

    if (parsed.kind !== 'AgentDefinition') {
      const sanitizedKind = String(parsed.kind ?? '').slice(0, 100);
      throw new BadRequestException(
        `Invalid kind '${sanitizedKind}'. Expected 'AgentDefinition'`,
      );
    }

    const metadata = parsed.metadata as Record<string, unknown>;
    const spec = parsed.spec as Record<string, unknown>;

    if (!metadata || !spec) {
      throw new BadRequestException('Import format must include metadata and spec sections');
    }

    // Map to CreateAgentDefinitionDto
    const createDto: CreateAgentDefinitionDto = {
      name: metadata.name as string,
      displayName: (metadata.display_name as string) || (metadata.name as string),
      description: metadata.description as string | undefined,
      version: metadata.version as string | undefined,
      definition: spec,
      icon: metadata.icon as string | undefined,
      category: (metadata.category as string) || 'custom',
      tags: metadata.tags as string[] | undefined,
    };

    return this.createDefinition(workspaceId, createDto, actorId);
  }
}
