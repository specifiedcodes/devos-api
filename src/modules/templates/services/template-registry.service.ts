/**
 * TemplateRegistryService
 *
 * Story 19-1: Template Registry Backend
 *
 * Database-backed template storage system for dynamic, versionable templates.
 * Provides CRUD operations, publishing workflow, usage tracking, and filtering.
 */
import { Injectable, Logger, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template, TemplateCategory, TemplateSourceType } from '../../../database/entities/template.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { TemplateAuditService } from './template-audit.service';
import { TemplateValidatorService } from './template-validator.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { ListTemplatesQueryDto } from '../dto/list-templates-query.dto';
import { TemplateListResult, TemplateCategoryCount } from '../interfaces/template.interfaces';
import { TEMPLATE_DEFINITION_CONSTANTS } from '../constants/template-definition.constants';

@Injectable()
export class TemplateRegistryService {
  private readonly logger = new Logger(TemplateRegistryService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepository: Repository<WorkspaceMember>,
    private readonly auditService: TemplateAuditService,
    private readonly validatorService: TemplateValidatorService,
  ) {}

  /**
   * Create a new template.
   */
  async create(
    workspaceId: string | null,
    dto: CreateTemplateDto,
    userId: string,
  ): Promise<Template> {
    // Validate workspace membership if workspace is specified
    if (workspaceId) {
      const membership = await this.memberRepository.findOne({
        where: { workspaceId, userId },
      });

      if (!membership) {
        throw new ForbiddenException('User is not a member of this workspace');
      }

      if (membership.role === WorkspaceRole.VIEWER) {
        throw new ForbiddenException('Viewers cannot create templates');
      }

      // Check workspace template limit
      const existingCount = await this.templateRepository.count({
        where: { workspaceId },
      });

      if (existingCount >= TEMPLATE_DEFINITION_CONSTANTS.MAX_DEFINITIONS_PER_WORKSPACE) {
        throw new BadRequestException(
          `Maximum number of templates (${TEMPLATE_DEFINITION_CONSTANTS.MAX_DEFINITIONS_PER_WORKSPACE}) reached for this workspace`,
        );
      }
    }

    // Check for duplicate name in workspace
    const existing = await this.findByName(workspaceId, dto.name);
    if (existing) {
      throw new ConflictException(
        `Template with name '${dto.name}' already exists in this workspace`,
      );
    }

    // Validate definition against JSON Schema
    const validationResult = this.validatorService.validateDefinition(
      dto.definition as unknown as Record<string, unknown>,
    );

    if (!validationResult.valid) {
      throw new BadRequestException({
        message: 'Template definition validation failed',
        errors: validationResult.errors,
      });
    }

    // Sanitize tags
    const sanitizedTags = this.sanitizeTags(dto.tags || []);

    // Create template entity
    const template = this.templateRepository.create({
      workspaceId,
      name: dto.name,
      displayName: dto.displayName,
      description: dto.description || null,
      longDescription: dto.longDescription || null,
      version: dto.version || '1.0.0',
      schemaVersion: TEMPLATE_DEFINITION_CONSTANTS.CURRENT_SCHEMA_VERSION,
      definition: dto.definition as any,
      category: dto.category || TemplateCategory.WEB_APP,
      tags: sanitizedTags,
      icon: dto.icon || 'layout-dashboard',
      screenshots: dto.screenshots || [],
      stackSummary: dto.stackSummary || {},
      variables: dto.variables || [],
      sourceType: dto.sourceType || TemplateSourceType.GIT,
      sourceUrl: dto.sourceUrl || null,
      sourceBranch: dto.sourceBranch || 'main',
      isOfficial: dto.isOfficial || false,
      isPublished: dto.isPublished || false,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      createdBy: userId,
    });

    const saved = await this.templateRepository.save(template);

    // Log audit event (fire-and-forget)
    await this.auditService.logTemplateCreated(workspaceId, saved.id, userId, {
      name: saved.name,
      category: saved.category,
    });

    return saved;
  }

  /**
   * Find template by ID.
   */
  async findById(id: string): Promise<Template | null> {
    return this.templateRepository.findOne({
      where: { id },
      relations: ['workspace', 'creator'],
    });
  }

  /**
   * Find template by name within a workspace (or official templates).
   */
  async findByName(workspaceId: string | null, name: string): Promise<Template | null> {
    const qb = this.templateRepository.createQueryBuilder('template');

    if (workspaceId) {
      qb.where('template.workspaceId = :workspaceId', { workspaceId });
    } else {
      qb.where('template.workspaceId IS NULL');
    }

    qb.andWhere('template.name = :name', { name });

    return qb.getOne();
  }

  /**
   * List templates with filtering, pagination, and sorting.
   */
  async list(query: ListTemplatesQueryDto): Promise<TemplateListResult<Template>> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.templateRepository.createQueryBuilder('template');

    // Apply filters
    if (query.category) {
      qb.andWhere('template.category = :category', { category: query.category });
    }

    if (query.tag) {
      qb.andWhere('template.tags @> :tag', { tag: [query.tag] });
    }

    if (query.search) {
      const escapedSearch = query.search.replace(/[%_]/g, '\\$&');
      qb.andWhere(
        '(template.name ILIKE :search OR template.displayName ILIKE :search OR template.description ILIKE :search)',
        { search: `%${escapedSearch}%` },
      );
    }

    if (query.isOfficial !== undefined) {
      qb.andWhere('template.isOfficial = :isOfficial', { isOfficial: query.isOfficial });
    }

    if (query.isPublished !== undefined) {
      qb.andWhere('template.isPublished = :isPublished', { isPublished: query.isPublished });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('template.isActive = :isActive', { isActive: query.isActive });
    }

    // Workspace filter (for workspace-specific templates)
    if (query.workspaceId) {
      qb.andWhere('template.workspaceId = :workspaceId', { workspaceId: query.workspaceId });
    } else {
      // By default, show official/published templates + workspace templates
      qb.andWhere(
        '(template.isOfficial = true OR template.isPublished = true OR template.workspaceId IS NULL)',
      );
    }

    // Apply sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'DESC';
    qb.orderBy(`template.${sortBy}`, sortOrder);

    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return { items, total, page, limit };
  }

  /**
   * Update a template.
   */
  async update(
    id: string,
    dto: UpdateTemplateDto,
    userId: string,
  ): Promise<Template> {
    const template = await this.findById(id);

    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    // Check authorization
    await this.checkAuthorization(template, userId, 'update');

    // Track changed fields
    const changedFields: string[] = [];

    // Validate definition if provided
    if (dto.definition) {
      const validationResult = this.validatorService.validateDefinition(
        dto.definition as unknown as Record<string, unknown>,
      );

      if (!validationResult.valid) {
        throw new BadRequestException({
          message: 'Template definition validation failed',
          errors: validationResult.errors,
        });
      }
    }

    // Update fields
    if (dto.displayName !== undefined) {
      template.displayName = dto.displayName;
      changedFields.push('displayName');
    }

    if (dto.description !== undefined) {
      template.description = dto.description;
      changedFields.push('description');
    }

    if (dto.longDescription !== undefined) {
      template.longDescription = dto.longDescription;
      changedFields.push('longDescription');
    }

    if (dto.version !== undefined) {
      template.version = dto.version;
      changedFields.push('version');
    }

    if (dto.definition !== undefined) {
      template.definition = dto.definition as any;
      changedFields.push('definition');
    }

    if (dto.category !== undefined) {
      template.category = dto.category;
      changedFields.push('category');
    }

    if (dto.tags !== undefined) {
      template.tags = this.sanitizeTags(dto.tags);
      changedFields.push('tags');
    }

    if (dto.icon !== undefined) {
      template.icon = dto.icon;
      changedFields.push('icon');
    }

    if (dto.screenshots !== undefined) {
      template.screenshots = dto.screenshots;
      changedFields.push('screenshots');
    }

    if (dto.stackSummary !== undefined) {
      template.stackSummary = dto.stackSummary as any;
      changedFields.push('stackSummary');
    }

    if (dto.variables !== undefined) {
      template.variables = dto.variables;
      changedFields.push('variables');
    }

    if (dto.sourceType !== undefined) {
      template.sourceType = dto.sourceType;
      changedFields.push('sourceType');
    }

    if (dto.sourceUrl !== undefined) {
      template.sourceUrl = dto.sourceUrl;
      changedFields.push('sourceUrl');
    }

    if (dto.sourceBranch !== undefined) {
      template.sourceBranch = dto.sourceBranch;
      changedFields.push('sourceBranch');
    }

    if (dto.isActive !== undefined) {
      template.isActive = dto.isActive;
      changedFields.push('isActive');
    }

    const saved = await this.templateRepository.save(template);

    // Log audit event
    await this.auditService.logTemplateUpdated(
      template.workspaceId,
      saved.id,
      userId,
      changedFields,
    );

    return saved;
  }

  /**
   * Delete a template.
   */
  async delete(id: string, userId: string): Promise<void> {
    const template = await this.findById(id);

    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    // Check authorization
    await this.checkAuthorization(template, userId, 'delete');

    // Log audit event before deletion
    await this.auditService.logTemplateDeleted(
      template.workspaceId,
      template.id,
      userId,
      {
        name: template.name,
        displayName: template.displayName,
        category: template.category,
      },
    );

    await this.templateRepository.remove(template);
  }

  /**
   * Publish a template.
   */
  async publish(id: string, userId: string): Promise<Template> {
    const template = await this.findById(id);

    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    // Check authorization
    await this.checkAuthorization(template, userId, 'publish');

    if (template.isPublished) {
      return template; // Already published
    }

    template.isPublished = true;
    const saved = await this.templateRepository.save(template);

    await this.auditService.logTemplatePublished(
      template.workspaceId,
      saved.id,
      userId,
      saved.version,
    );

    return saved;
  }

  /**
   * Unpublish a template.
   */
  async unpublish(id: string, userId: string): Promise<Template> {
    const template = await this.findById(id);

    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    // Check authorization
    await this.checkAuthorization(template, userId, 'unpublish');

    if (!template.isPublished) {
      return template; // Already unpublished
    }

    template.isPublished = false;
    const saved = await this.templateRepository.save(template);

    await this.auditService.logTemplateUnpublished(
      template.workspaceId,
      saved.id,
      userId,
    );

    return saved;
  }

  /**
   * Increment template usage count.
   */
  async incrementUsage(id: string, workspaceId?: string, projectId?: string): Promise<void> {
    await this.templateRepository
      .createQueryBuilder()
      .update(Template)
      .set({
        totalUses: () => 'total_uses + 1',
      })
      .where('id = :id', { id })
      .execute();

    // Log usage event (fire-and-forget)
    await this.auditService.logTemplateUsed(workspaceId || null, id, projectId);
  }

  /**
   * Update template rating aggregation.
   */
  async updateRating(id: string, newRating: number): Promise<void> {
    const template = await this.findById(id);
    if (!template) return;

    const oldRating = Number(template.avgRating) || 0;
    const oldCount = template.ratingCount || 0;
    const newCount = oldCount + 1;

    // Calculate new average
    const newAvg = (oldRating * oldCount + newRating) / newCount;

    await this.templateRepository.update(id, {
      avgRating: Math.round(newAvg * 100) / 100, // Round to 2 decimal places
      ratingCount: newCount,
    });

    // Log rating update
    await this.auditService.logTemplateRatingUpdated(
      template.workspaceId,
      id,
      oldRating,
      newAvg,
      newCount,
    );
  }

  /**
   * Find templates by category.
   */
  async findByCategory(category: TemplateCategory): Promise<Template[]> {
    return this.templateRepository.find({
      where: {
        category,
        isActive: true,
        isPublished: true,
      },
      order: { totalUses: 'DESC' },
    });
  }

  /**
   * Search templates by query string.
   */
  async search(query: string, limit: number = 20): Promise<Template[]> {
    const escapedQuery = query.replace(/[%_]/g, '\\$&');

    return this.templateRepository
      .createQueryBuilder('template')
      .where('template.isActive = true')
      .andWhere('template.isPublished = true')
      .andWhere(
        '(template.name ILIKE :query OR template.displayName ILIKE :query OR template.description ILIKE :query)',
        { query: `%${escapedQuery}%` },
      )
      .orderBy('template.totalUses', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get featured templates (official + high usage).
   * Story 19-8: Now prioritizes templates with isFeatured=true
   */
  async getFeatured(limit: number = 10): Promise<Template[]> {
    // First try to get explicitly featured templates
    const featuredTemplates = await this.templateRepository
      .createQueryBuilder('template')
      .where('template.isActive = true')
      .andWhere('template.isPublished = true')
      .andWhere('template.isFeatured = true')
      .orderBy('template.featuredOrder', 'ASC')
      .addOrderBy('template.avgRating', 'DESC')
      .limit(limit)
      .getMany();

    // If we have enough featured templates, return them
    if (featuredTemplates.length >= limit) {
      return featuredTemplates;
    }

    // Otherwise, fill the rest with official/high-usage templates
    const featuredIds = featuredTemplates.map((t) => t.id);
    const additionalTemplates = await this.templateRepository
      .createQueryBuilder('template')
      .where('template.isActive = true')
      .andWhere('template.isPublished = true')
      .andWhere('template.isFeatured = false')
      .andWhere(featuredIds.length > 0 ? 'template.id NOT IN (:...featuredIds)' : '1=1', { featuredIds })
      .orderBy('template.isOfficial', 'DESC')
      .addOrderBy('template.avgRating', 'DESC')
      .addOrderBy('template.totalUses', 'DESC')
      .limit(limit - featuredTemplates.length)
      .getMany();

    return [...featuredTemplates, ...additionalTemplates];
  }

  /**
   * Get trending templates (high recent usage).
   */
  async getTrending(limit: number = 10): Promise<Template[]> {
    return this.templateRepository
      .createQueryBuilder('template')
      .where('template.isActive = true')
      .andWhere('template.isPublished = true')
      .orderBy('template.totalUses', 'DESC')
      .addOrderBy('template.avgRating', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get category counts.
   */
  async getCategories(): Promise<TemplateCategoryCount[]> {
    const result = await this.templateRepository
      .createQueryBuilder('template')
      .select('template.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('template.isActive = true')
      .andWhere('template.isPublished = true')
      .groupBy('template.category')
      .orderBy('count', 'DESC')
      .getRawMany();

    return result.map((r) => ({
      category: r.category,
      count: parseInt(r.count, 10),
    }));
  }

  /**
   * Get all official templates.
   */
  async getOfficialTemplates(): Promise<Template[]> {
    return this.templateRepository.find({
      where: {
        isOfficial: true,
        isActive: true,
      },
      order: { name: 'ASC' },
    });
  }

  /**
   * Migrate hardcoded templates from TEMPLATE_REGISTRY to database.
   * This is an idempotent operation.
   */
  async migrateHardcodedTemplates(): Promise<{ migrated: number; skipped: number }> {
    // Import hardcoded templates dynamically to avoid circular dependency
    const {
      TEMPLATE_REGISTRY,
      TemplateCategory: LegacyCategory,
    } = await import('../constants/template-registry.constant');

    let migrated = 0;
    let skipped = 0;

    // Category mapping from legacy to new
    const categoryMap: Record<string, TemplateCategory> = {
      [LegacyCategory.SAAS]: TemplateCategory.SAAS,
      [LegacyCategory.ECOMMERCE]: TemplateCategory.ECOMMERCE,
      [LegacyCategory.MOBILE]: TemplateCategory.MOBILE,
      [LegacyCategory.API]: TemplateCategory.API,
    };

    for (const hardcodedTemplate of TEMPLATE_REGISTRY) {
      // Check if already exists
      const existing = await this.findByName(null, hardcodedTemplate.id);
      if (existing) {
        skipped++;
        continue;
      }

      // Map legacy template to new entity structure
      const template = this.templateRepository.create({
        workspaceId: null, // Official templates have no workspace
        name: hardcodedTemplate.id,
        displayName: hardcodedTemplate.name,
        description: hardcodedTemplate.description,
        longDescription: null,
        version: '1.0.0',
        schemaVersion: 'v1',
        definition: {
          stack: {
            frontend: hardcodedTemplate.techStack.framework,
            backend: hardcodedTemplate.techStack.apiLayer,
            database: hardcodedTemplate.techStack.database,
            styling: hardcodedTemplate.techStack.styling,
          },
          variables: [],
          files: {
            source_type: 'git',
            repository: null,
            branch: 'main',
          },
        },
        category: categoryMap[hardcodedTemplate.category] || TemplateCategory.WEB_APP,
        tags: hardcodedTemplate.tags || [],
        icon: hardcodedTemplate.icon || 'layout-dashboard',
        screenshots: [],
        stackSummary: {
          frontend: hardcodedTemplate.techStack.framework,
          backend: hardcodedTemplate.techStack.apiLayer,
          database: hardcodedTemplate.techStack.database,
          styling: hardcodedTemplate.techStack.styling,
        },
        variables: [],
        sourceType: TemplateSourceType.GIT,
        sourceUrl: null,
        sourceBranch: 'main',
        isOfficial: true,
        isPublished: true,
        isActive: true,
        createdBy: null,
      });

      await this.templateRepository.save(template);
      migrated++;
    }

    this.logger.log(`Migration complete: ${migrated} migrated, ${skipped} skipped`);
    return { migrated, skipped };
  }

  /**
   * Sanitize tags: trim, lowercase, deduplicate, and limit.
   */
  private sanitizeTags(tags: string[]): string[] {
    const sanitized = tags
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0 && tag.length <= TEMPLATE_DEFINITION_CONSTANTS.MAX_TAG_LENGTH)
      .filter((tag, index, self) => self.indexOf(tag) === index);

    return sanitized.slice(0, TEMPLATE_DEFINITION_CONSTANTS.MAX_TAGS);
  }

  /**
   * Check if user is authorized to perform action on template.
   */
  private async checkAuthorization(
    template: Template,
    userId: string,
    action: 'update' | 'delete' | 'publish' | 'unpublish',
  ): Promise<void> {
    // Official templates (no workspace) can only be modified by platform admins
    // For now, we allow creators to manage their templates
    if (!template.workspaceId) {
      // This is an official template - check if user created it
      if (template.createdBy !== userId) {
        throw new ForbiddenException('Only the creator can modify official templates');
      }
      return;
    }

    // Check workspace membership
    const membership = await this.memberRepository.findOne({
      where: { workspaceId: template.workspaceId, userId },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this workspace');
    }

    // Admin can do anything
    if (membership.role === WorkspaceRole.ADMIN) {
      return;
    }

    // For non-admins, check if they are the creator
    if (template.createdBy === userId) {
      return;
    }

    throw new ForbiddenException('You do not have permission to perform this action');
  }
}
