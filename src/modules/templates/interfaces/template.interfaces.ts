/**
 * Template Interfaces
 *
 * Story 19-1: Template Registry Backend
 *
 * TypeScript interfaces for template validation and service responses.
 */
import { TemplateCategory, TemplateSourceType } from '../../../database/entities/template.entity';

/**
 * Result of template definition validation
 */
export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
  warnings: TemplateValidationWarning[];
}

/**
 * Validation error detail
 */
export interface TemplateValidationError {
  path: string;
  message: string;
  keyword?: string;
  params?: Record<string, unknown>;
}

/**
 * Validation warning detail
 */
export interface TemplateValidationWarning {
  path: string;
  message: string;
  type: 'recommendation' | 'deprecation' | 'compatibility';
}

/**
 * Result of listing templates with pagination
 */
export interface TemplateListResult<T = unknown> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Input for creating an audit event
 */
export interface TemplateAuditEventInput {
  workspaceId: string | null;
  eventType: string;
  templateId?: string;
  actorId?: string;
  details?: Record<string, unknown>;
}

/**
 * Query parameters for listing templates
 */
export interface TemplateListQuery {
  category?: TemplateCategory;
  tag?: string;
  search?: string;
  isOfficial?: boolean;
  isPublished?: boolean;
  isActive?: boolean;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'totalUses' | 'avgRating';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
  workspaceId?: string;
}

/**
 * Category with count for category listing
 */
export interface TemplateCategoryCount {
  category: string;
  count: number;
}
