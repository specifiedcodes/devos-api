import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TEMPLATE_REGISTRY,
  ProjectTemplate,
  TemplateCategory,
  TEMPLATE_IDS,
  TEMPLATE_CATEGORIES,
  TechStack,
  DefaultPreferences,
} from '../constants/template-registry.constant';

@Injectable()
export class TemplatesService {
  constructor() {
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
   * Get all available templates
   * @returns Array of all templates from the registry (deep cloned to prevent mutations)
   */
  getAllTemplates(): ProjectTemplate[] {
    return TEMPLATE_REGISTRY.map((template) => this.cloneTemplate(template));
  }

  /**
   * Get a single template by ID
   * @param id - Template identifier
   * @returns Template object (deep cloned to prevent mutations)
   * @throws NotFoundException if template not found
   */
  getTemplateById(id: string): ProjectTemplate {
    const template = TEMPLATE_REGISTRY.find((t) => t.id === id);

    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    return this.cloneTemplate(template);
  }

  /**
   * Get templates filtered by category
   * @param category - Template category to filter by
   * @returns Array of templates matching the category (deep cloned to prevent mutations)
   */
  getTemplatesByCategory(category: TemplateCategory): ProjectTemplate[] {
    // Validate category first
    if (!this.validateCategory(category)) {
      // Return empty array for invalid categories instead of throwing error
      // This allows the API to be more forgiving for filtering operations
      return [];
    }

    return TEMPLATE_REGISTRY
      .filter((t) => t.category === category)
      .map((template) => this.cloneTemplate(template));
  }

  /**
   * Get the recommended/featured template
   * @returns The template marked as recommended (deep cloned to prevent mutations)
   * @throws Error if no recommended template is found (registry misconfiguration)
   */
  getRecommendedTemplate(): ProjectTemplate {
    const recommended = TEMPLATE_REGISTRY.find((t) => t.recommended === true);

    if (!recommended) {
      // This indicates a critical registry misconfiguration - don't hide it
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
  getTemplateForProject(templateId: string): {
    techStack: TechStack;
    preferences: DefaultPreferences;
  } {
    const template = this.getTemplateById(templateId);

    // getTemplateById already returns a deep clone, so we're safe here
    return {
      techStack: template.techStack,
      preferences: template.defaultPreferences,
    };
  }

  /**
   * Validate that a template ID exists in the registry
   * @param templateId - Template identifier to validate
   * @returns true if template exists, false otherwise
   */
  validateTemplateId(templateId: string): boolean {
    return TEMPLATE_IDS.includes(templateId);
  }

  /**
   * Validate that a category is valid
   * @param category - Category to validate
   * @returns true if category is valid, false otherwise
   */
  validateCategory(category: TemplateCategory): boolean {
    return TEMPLATE_CATEGORIES.includes(category);
  }
}
