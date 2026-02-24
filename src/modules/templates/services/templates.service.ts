/**
 * TemplatesService
 *
 * Story 19-1: Template Registry Backend
 *
 * Service for template operations with database-first, hardcoded fallback.
 * Maintains backward compatibility with Story 4.2 API contract.
 */
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TEMPLATE_REGISTRY,
  ProjectTemplate,
  TemplateCategory as LegacyTemplateCategory,
  TEMPLATE_IDS,
  TEMPLATE_CATEGORIES,
  TechStack,
  DefaultPreferences,
} from '../constants/template-registry.constant';
import { Template, TemplateCategory } from '../../../database/entities/template.entity';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
  ) {
    // Validate registry on service initialization
    this.validateRegistryIntegrity();
  }

  /**
   * Validate the template registry for common issues
   * Runs on service startup to catch configuration errors early
   */
  private validateRegistryIntegrity(): void {
    // Check for duplicate template IDs
    const ids = TEMPLATE_REGISTRY.map((t) => t.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error(
        'Template registry misconfigured: Duplicate template IDs found. ' +
          'Each template must have a unique ID.',
      );
    }

    // Check for exactly one recommended template
    const recommendedCount = TEMPLATE_REGISTRY.filter((t) => t.recommended).length;
    if (recommendedCount === 0) {
      throw new Error(
        'Template registry misconfigured: No recommended template found. ' +
          'Exactly one template must have recommended: true',
      );
    }
    if (recommendedCount > 1) {
      throw new Error(
        'Template registry misconfigured: Multiple recommended templates found. ' +
          'Exactly one template must have recommended: true',
      );
    }
  }

  /**
   * Deep clone a template to prevent mutations to the registry
   * @param template - Template to clone
   * @returns Deep cloned template object
   */
  private cloneTemplate(template: ProjectTemplate): ProjectTemplate {
    return JSON.parse(JSON.stringify(template));
  }

  /**
   * Convert database Template entity to legacy ProjectTemplate format
   */
  private toProjectTemplate(template: Template): ProjectTemplate {
    return {
      id: template.name, // Use name as ID for backward compatibility
      name: template.displayName,
      description: template.description || '',
      category: this.mapCategoryToLegacy(template.category),
      techStack: {
        framework: template.stackSummary?.frontend || template.definition?.stack?.frontend || '',
        language: 'TypeScript',
        styling: template.stackSummary?.styling || template.definition?.stack?.styling,
        database: template.stackSummary?.database || template.definition?.stack?.database,
        orm: undefined,
        apiLayer: template.stackSummary?.backend || template.definition?.stack?.backend,
        testing: [],
        additional: [],
      },
      defaultPreferences: {
        repoStructure: 'polyrepo',
        codeStyle: 'ESLint + Prettier',
        testingStrategy: 'Jest',
        cicd: template.definition?.stack?.deployment || 'GitHub Actions',
      },
      icon: template.icon,
      recommended: template.isOfficial && template.name === 'nextjs-saas-starter',
      tags: template.tags,
    };
  }

  /**
   * Map new category to legacy category
   */
  private mapCategoryToLegacy(category: TemplateCategory): LegacyTemplateCategory {
    const categoryMap: Record<string, LegacyTemplateCategory> = {
      [TemplateCategory.WEB_APP]: LegacyTemplateCategory.SAAS,
      [TemplateCategory.SAAS]: LegacyTemplateCategory.SAAS,
      [TemplateCategory.ECOMMERCE]: LegacyTemplateCategory.ECOMMERCE,
      [TemplateCategory.MOBILE]: LegacyTemplateCategory.MOBILE,
      [TemplateCategory.API]: LegacyTemplateCategory.API,
      [TemplateCategory.BLOG]: LegacyTemplateCategory.SAAS,
      [TemplateCategory.AI_APP]: LegacyTemplateCategory.SAAS,
      [TemplateCategory.REALTIME]: LegacyTemplateCategory.SAAS,
    };
    return categoryMap[category] || LegacyTemplateCategory.SAAS;
  }

  /**
   * Get all available templates
   * Database-first with hardcoded fallback
   * @returns Array of all templates (deep cloned to prevent mutations)
   */
  async getAllTemplates(): Promise<ProjectTemplate[]> {
    // Try database first
    try {
      const dbTemplates = await this.templateRepository.find({
        where: { isActive: true },
        order: { isOfficial: 'DESC', name: 'ASC' },
      });

      if (dbTemplates.length > 0) {
        this.logger.debug(`Found ${dbTemplates.length} templates in database`);
        return dbTemplates.map((t) => this.toProjectTemplate(t));
      }
    } catch (error) {
      this.logger.warn('Database query failed, falling back to hardcoded templates', error);
    }

    // Fallback to hardcoded registry
    this.logger.debug('Using hardcoded template registry');
    return TEMPLATE_REGISTRY.map((template) => this.cloneTemplate(template));
  }

  /**
   * Get a single template by ID
   * Database-first with hardcoded fallback
   * @param id - Template identifier (UUID or slug)
   * @returns Template object (deep cloned to prevent mutations)
   * @throws NotFoundException if template not found
   */
  async getTemplateById(id: string): Promise<ProjectTemplate> {
    // Try database first (check if it's a UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(id)) {
      try {
        const dbTemplate = await this.templateRepository.findOne({
          where: { id },
        });

        if (dbTemplate) {
          return this.toProjectTemplate(dbTemplate);
        }
      } catch (error) {
        this.logger.warn(`Database query failed for ID ${id}`, error);
      }
    }

    // Try database by name (slug)
    try {
      const dbTemplate = await this.templateRepository.findOne({
        where: { name: id },
      });

      if (dbTemplate) {
        return this.toProjectTemplate(dbTemplate);
      }
    } catch (error) {
      this.logger.warn(`Database query failed for name ${id}`, error);
    }

    // Fallback to hardcoded registry
    const template = TEMPLATE_REGISTRY.find((t) => t.id === id);

    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    return this.cloneTemplate(template);
  }

  /**
   * Get templates filtered by category
   * Database-first with hardcoded fallback
   * @param category - Template category to filter by
   * @returns Array of templates matching the category (deep cloned to prevent mutations)
   */
  async getTemplatesByCategory(category: LegacyTemplateCategory): Promise<ProjectTemplate[]> {
    // Validate category first
    if (!this.validateCategory(category)) {
      return [];
    }

    // Try database first
    try {
      // Map legacy category to new category
      const newCategoryMap: Record<string, TemplateCategory> = {
        [LegacyTemplateCategory.SAAS]: TemplateCategory.SAAS,
        [LegacyTemplateCategory.ECOMMERCE]: TemplateCategory.ECOMMERCE,
        [LegacyTemplateCategory.MOBILE]: TemplateCategory.MOBILE,
        [LegacyTemplateCategory.API]: TemplateCategory.API,
      };

      const newCategory = newCategoryMap[category];
      const dbTemplates = await this.templateRepository.find({
        where: { category: newCategory, isActive: true },
        order: { name: 'ASC' },
      });

      if (dbTemplates.length > 0) {
        return dbTemplates.map((t) => this.toProjectTemplate(t));
      }
    } catch (error) {
      this.logger.warn(`Database query failed for category ${category}`, error);
    }

    // Fallback to hardcoded registry
    return TEMPLATE_REGISTRY.filter((t) => t.category === category).map((template) =>
      this.cloneTemplate(template),
    );
  }

  /**
   * Get the recommended/featured template
   * Database-first with hardcoded fallback
   * @returns The template marked as recommended (deep cloned to prevent mutations)
   * @throws Error if no recommended template is found (registry misconfiguration)
   */
  async getRecommendedTemplate(): Promise<ProjectTemplate> {
    // Try database first - find official nextjs-saas-starter
    try {
      const dbTemplate = await this.templateRepository.findOne({
        where: { name: 'nextjs-saas-starter', isOfficial: true, isActive: true },
      });

      if (dbTemplate) {
        return this.toProjectTemplate(dbTemplate);
      }
    } catch (error) {
      this.logger.warn('Database query failed for recommended template', error);
    }

    // Fallback to hardcoded registry
    const recommended = TEMPLATE_REGISTRY.find((t) => t.recommended === true);

    if (!recommended) {
      throw new Error(
        'Template registry misconfigured: No recommended template found. ' +
          'Exactly one template must have recommended: true',
      );
    }

    return this.cloneTemplate(recommended);
  }

  /**
   * Helper method to get template data for project creation
   * Extracts only the tech stack and preferences needed for project setup
   * @param templateId - Template identifier
   * @returns Object with techStack and preferences (deep cloned)
   * @throws NotFoundException if template not found
   */
  async getTemplateForProject(templateId: string): Promise<{
    techStack: TechStack;
    preferences: DefaultPreferences;
  }> {
    const template = await this.getTemplateById(templateId);

    return {
      techStack: template.techStack,
      preferences: template.defaultPreferences,
    };
  }

  /**
   * Validate that a template ID exists in the registry or database
   * @param templateId - Template identifier to validate
   * @returns true if template exists, false otherwise
   */
  async validateTemplateId(templateId: string): Promise<boolean> {
    // Check database first
    try {
      const dbTemplate = await this.templateRepository.findOne({
        where: [{ id: templateId }, { name: templateId }],
      });

      if (dbTemplate) {
        return true;
      }
    } catch (error) {
      this.logger.debug(`Database query failed for template ID validation ${templateId}`);
    }

    // Fallback to hardcoded
    return TEMPLATE_IDS.includes(templateId);
  }

  /**
   * Validate that a category is valid
   * @param category - Category to validate
   * @returns true if category is valid, false otherwise
   */
  validateCategory(category: LegacyTemplateCategory): boolean {
    return TEMPLATE_CATEGORIES.includes(category);
  }

  // ==================== Synchronous methods for backward compatibility ====================
  // These methods maintain the original synchronous API from Story 4.2

  /**
   * Get all templates synchronously (hardcoded only)
   * @deprecated Use getAllTemplates() instead
   */
  getAllTemplatesSync(): ProjectTemplate[] {
    return TEMPLATE_REGISTRY.map((template) => this.cloneTemplate(template));
  }

  /**
   * Get template by ID synchronously (hardcoded only)
   * @deprecated Use getTemplateById() instead
   */
  getTemplateByIdSync(id: string): ProjectTemplate {
    const template = TEMPLATE_REGISTRY.find((t) => t.id === id);

    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    return this.cloneTemplate(template);
  }

  /**
   * Get templates by category synchronously (hardcoded only)
   * @deprecated Use getTemplatesByCategory() instead
   */
  getTemplatesByCategorySync(category: LegacyTemplateCategory): ProjectTemplate[] {
    if (!this.validateCategory(category)) {
      return [];
    }

    return TEMPLATE_REGISTRY.filter((t) => t.category === category).map((template) =>
      this.cloneTemplate(template),
    );
  }
}
