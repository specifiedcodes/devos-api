/**
 * AdminFeaturedTemplatesService
 *
 * Story 19-8: Featured Templates Curation
 *
 * Service for managing featured templates by platform admins.
 */
import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Template, TemplateTestStatus } from '../../../database/entities/template.entity';
import { TemplateAuditService } from '../../templates/services/template-audit.service';
import {
  FeatureTemplateDto,
  ReorderFeaturedTemplatesDto,
  FeaturedTemplateResponseDto,
  FeaturedTemplatesListResponseDto,
  ListFeaturedTemplatesQueryDto,
  FEATURED_TEMPLATES_CONSTANTS,
} from '../../templates/dto/featured-template.dto';

@Injectable()
export class AdminFeaturedTemplatesService {
  private readonly logger = new Logger(AdminFeaturedTemplatesService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    private readonly dataSource: DataSource,
    private readonly auditService: TemplateAuditService,
  ) {}

  /**
   * Get all featured templates with optional filtering
   */
  async listFeatured(
    query?: ListFeaturedTemplatesQueryDto,
  ): Promise<FeaturedTemplatesListResponseDto> {
    const qb = this.templateRepository
      .createQueryBuilder('template')
      .where('template.isFeatured = true')
      .orderBy('template.featuredOrder', 'ASC')
      .addOrderBy('template.avgRating', 'DESC');

    // Filter by test status if provided
    if (query?.testStatus) {
      qb.andWhere('template.testStatus = :testStatus', { testStatus: query.testStatus });
    }

    const templates = await qb.getMany();

    return {
      templates: templates.map((t) => this.toResponseDto(t)),
      total: templates.length,
      maxAllowed: FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_TEMPLATES,
    };
  }

  /**
   * Get templates eligible for featuring (published but not featured)
   */
  async getEligibleTemplates(limit: number = 50): Promise<FeaturedTemplateResponseDto[]> {
    const templates = await this.templateRepository
      .createQueryBuilder('template')
      .where('template.isPublished = true')
      .andWhere('template.isActive = true')
      .andWhere('template.isFeatured = false')
      .orderBy('template.isOfficial', 'DESC')
      .addOrderBy('template.avgRating', 'DESC')
      .addOrderBy('template.totalUses', 'DESC')
      .limit(limit)
      .getMany();

    return templates.map((t) => this.toResponseDto(t));
  }

  /**
   * Feature a template
   */
  async featureTemplate(
    templateId: string,
    dto: FeatureTemplateDto,
    adminId: string,
  ): Promise<FeaturedTemplateResponseDto> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID '${templateId}' not found`);
    }

    // Check if template is published
    if (!template.isPublished) {
      throw new BadRequestException('Only published templates can be featured');
    }

    // Check if template is active
    if (!template.isActive) {
      throw new BadRequestException('Only active templates can be featured');
    }

    // Check if already featured
    if (template.isFeatured) {
      throw new ConflictException('Template is already featured');
    }

    // Determine the featured order
    let featuredOrder = dto.featuredOrder;
    if (featuredOrder === undefined) {
      // Add to the end
      const maxOrder = await this.getMaxFeaturedOrder();
      featuredOrder = Math.min(maxOrder + 1, FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_ORDER);
    }

    // Use transaction for atomic update (includes count check, save, and reorder)
    const saved = await this.dataSource.transaction(async (manager) => {
      // Check current featured count within transaction to prevent race conditions
      const currentFeaturedCount = await manager.count(Template, {
        where: { isFeatured: true },
      });

      if (currentFeaturedCount >= FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_TEMPLATES) {
        throw new BadRequestException(
          `Maximum of ${FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_TEMPLATES} featured templates reached. Unfeature a template first.`,
        );
      }

      // Update the template
      template.isFeatured = true;
      template.featuredOrder = featuredOrder;
      template.testStatus = TemplateTestStatus.PENDING;

      const savedTemplate = await manager.save(template);

      // Reorder other templates to make room
      await manager
        .createQueryBuilder()
        .update(Template)
        .set({
          featuredOrder: () => 'featured_order + 1',
        })
        .where('is_featured = true')
        .andWhere('featured_order >= :fromOrder', { fromOrder: featuredOrder })
        .execute();

      return savedTemplate;
    });

    // Log audit event
    await this.auditService.logTemplateFeatured(
      template.workspaceId,
      saved.id,
      adminId,
      featuredOrder,
    );

    this.logger.log(`Template '${saved.name}' featured at position ${featuredOrder} by admin ${adminId}`);

    return this.toResponseDto(saved);
  }

  /**
   * Unfeature a template
   */
  async unfeatureTemplate(templateId: string, adminId: string): Promise<FeaturedTemplateResponseDto> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID '${templateId}' not found`);
    }

    if (!template.isFeatured) {
      throw new BadRequestException('Template is not featured');
    }

    const oldOrder = template.featuredOrder;

    // Use transaction for atomic update
    const saved = await this.dataSource.transaction(async (manager) => {
      // Update the template
      template.isFeatured = false;
      template.featuredOrder = null;

      const savedTemplate = await manager.save(template);

      // Shift down orders for templates after this one
      if (oldOrder !== null) {
        await manager
          .createQueryBuilder()
          .update(Template)
          .set({
            featuredOrder: () => 'featured_order - 1',
          })
          .where('is_featured = true')
          .andWhere('featured_order >= :fromOrder', { fromOrder: oldOrder })
          .execute();
      }

      return savedTemplate;
    });

    // Log audit event
    await this.auditService.logTemplateUnfeatured(
      template.workspaceId,
      saved.id,
      adminId,
    );

    this.logger.log(`Template '${saved.name}' unfeatured by admin ${adminId}`);

    return this.toResponseDto(saved);
  }

  /**
   * Reorder featured templates
   */
  async reorderFeaturedTemplates(
    dto: ReorderFeaturedTemplatesDto,
    adminId: string,
  ): Promise<FeaturedTemplatesListResponseDto> {
    const { templateIds, items } = dto;

    // Use items if provided, otherwise create items from templateIds with sequential order
    const reorderItems = items || templateIds.map((id, index) => ({
      id,
      featuredOrder: index,
    }));

    // Validate all templates exist and are featured
    const templates = await this.templateRepository.find({
      where: { id: In(reorderItems.map((i) => i.id)) },
    });

    if (templates.length !== reorderItems.length) {
      const foundIds = new Set(templates.map((t) => t.id));
      const missingIds = reorderItems.filter((i) => !foundIds.has(i.id)).map((i) => i.id);
      throw new NotFoundException(`Templates not found: ${missingIds.join(', ')}`);
    }

    const nonFeatured = templates.filter((t) => !t.isFeatured);
    if (nonFeatured.length > 0) {
      throw new BadRequestException(
        `Cannot reorder non-featured templates: ${nonFeatured.map((t) => t.name).join(', ')}`,
      );
    }

    // Validate order values
    const orders = reorderItems.map((i) => i.featuredOrder);
    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== orders.length) {
      throw new BadRequestException('Duplicate featured orders are not allowed');
    }

    for (const order of orders) {
      if (order < 0 || order > FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_ORDER) {
        throw new BadRequestException(
          `Featured order must be between 0 and ${FEATURED_TEMPLATES_CONSTANTS.MAX_FEATURED_ORDER}`,
        );
      }
    }

    // Use transaction for atomic update
    await this.dataSource.transaction(async (manager) => {
      for (const item of reorderItems) {
        await manager.update(Template, { id: item.id }, { featuredOrder: item.featuredOrder });
      }
    });

    // Log audit event
    await this.auditService.logTemplatesReordered(null, adminId, reorderItems);

    this.logger.log(`Featured templates reordered by admin ${adminId}`);

    // Return updated list
    return this.listFeatured();
  }

  /**
   * Update test status for a featured template
   */
  async updateTestStatus(
    templateId: string,
    passing: boolean,
    errorMessage?: string,
    actorId?: string,
  ): Promise<void> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID '${templateId}' not found`);
    }

    if (!template.isFeatured) {
      return; // Only update test status for featured templates
    }

    const previousStatus = template.testStatus;
    template.testStatus = passing ? TemplateTestStatus.PASSING : TemplateTestStatus.FAILING;
    template.lastTestRunAt = new Date();

    await this.templateRepository.save(template);

    // Log audit event for test status changes
    await this.auditService.logEvent({
      workspaceId: template.workspaceId,
      eventType: 'template_test_status_updated' as any,
      templateId: template.id,
      actorId: actorId || null,
      details: {
        previousStatus,
        newStatus: template.testStatus,
        passing,
        errorMessage: errorMessage || null,
      },
    });

    if (!passing) {
      this.logger.warn(
        `Featured template '${template.name}' test failed: ${errorMessage || 'Unknown error'}`,
      );
    }
  }

  /**
   * Get the maximum featured order currently in use
   */
  private async getMaxFeaturedOrder(): Promise<number> {
    const result = await this.templateRepository
      .createQueryBuilder('template')
      .select('MAX(template.featuredOrder)', 'maxOrder')
      .where('template.isFeatured = true')
      .getRawOne();

    return result?.maxOrder ?? -1;
  }

  /**
   * Convert Template entity to response DTO
   */
  private toResponseDto(template: Template): FeaturedTemplateResponseDto {
    return {
      id: template.id,
      name: template.name,
      displayName: template.displayName,
      description: template.description ?? undefined,
      icon: template.icon,
      isOfficial: template.isOfficial,
      isFeatured: template.isFeatured,
      featuredOrder: template.featuredOrder ?? undefined,
      lastTestRunAt: template.lastTestRunAt?.toISOString(),
      testStatus: template.testStatus,
      totalUses: template.totalUses,
      avgRating: Number(template.avgRating) || 0,
      ratingCount: template.ratingCount,
      category: template.category,
      tags: template.tags,
      screenshots: template.screenshots,
      stackSummary: template.stackSummary as Record<string, unknown>,
    };
  }
}
