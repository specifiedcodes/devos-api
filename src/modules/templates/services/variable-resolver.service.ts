/**
 * VariableResolverService
 *
 * Story 19-3: Parameterized Scaffolding
 *
 * Validates and resolves user-provided variables against template definitions.
 * Supports string, select, boolean, number, multiselect, and secret types.
 */
import { Injectable, Logger } from '@nestjs/common';

/**
 * Variable type definition from template
 */
export interface VariableDefinition {
  name: string;
  type: 'string' | 'select' | 'boolean' | 'number' | 'multiselect' | 'secret';
  displayName?: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean | string[];
  options?: string[];
  validation?: string;
  min?: number;
  max?: number;
  dependsOn?: string;
  group?: string;
}

/**
 * Validation error detail
 */
export interface ValidationError {
  field: string;
  message: string;
  type: 'required' | 'type' | 'pattern' | 'range' | 'option';
}

/**
 * Result of variable validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

@Injectable()
export class VariableResolverService {
  private readonly logger = new Logger(VariableResolverService.name);

  /**
   * Validate user-provided variables against template definition.
   */
  validate(
    definitions: VariableDefinition[],
    values: Record<string, unknown>,
  ): ValidationResult {
    const errors: ValidationError[] = [];

    for (const def of definitions) {
      const value = values[def.name];

      // Check required
      if (def.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: def.name,
          message: `${def.displayName || def.name} is required`,
          type: 'required',
        });
        continue;
      }

      // Skip further validation if value is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type-specific validation
      const typeError = this.validateType(def, value);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      // Additional constraints
      const constraintError = this.validateConstraints(def, value);
      if (constraintError) {
        errors.push(constraintError);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Resolve variables with defaults for missing optional values.
   */
  resolve(
    definitions: VariableDefinition[],
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const def of definitions) {
      const value = values[def.name];

      if (value !== undefined && value !== null) {
        // Use provided value
        result[def.name] = value;
      } else if (def.default !== undefined) {
        // Use default value
        result[def.name] = def.default;
      }
      // If no value and no default, leave undefined
    }

    // Also include any extra values not in definitions
    for (const [key, value] of Object.entries(values)) {
      if (!(key in result) && value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Check if a variable should be shown based on dependencies.
   */
  shouldShow(
    definition: VariableDefinition,
    currentValues: Record<string, unknown>,
  ): boolean {
    if (!definition.dependsOn) {
      return true;
    }

    const dependencyValue = currentValues[definition.dependsOn];
    return this.isTruthy(dependencyValue);
  }

  /**
   * Convert variable to template-friendly format.
   */
  toTemplateValue(
    definition: VariableDefinition,
    value: unknown,
  ): string | number | boolean | string[] {
    if (value === null || value === undefined) {
      // Return appropriate empty value based on type
      switch (definition.type) {
        case 'string':
        case 'secret':
        case 'select':
          return '';
        case 'number':
          return 0;
        case 'boolean':
          return false;
        case 'multiselect':
          return [];
        default:
          return '';
      }
    }

    return value as string | number | boolean | string[];
  }

  /**
   * Validate value against its type definition.
   */
  private validateType(def: VariableDefinition, value: unknown): ValidationError | null {
    switch (def.type) {
      case 'string':
      case 'secret':
        if (typeof value !== 'string') {
          return {
            field: def.name,
            message: `${def.displayName || def.name} must be a string`,
            type: 'type',
          };
        }
        break;

      case 'select':
        if (typeof value !== 'string') {
          return {
            field: def.name,
            message: `${def.displayName || def.name} must be a string`,
            type: 'type',
          };
        }
        if (def.options && !def.options.includes(value)) {
          return {
            field: def.name,
            message: `${def.displayName || def.name} must be one of: ${def.options.join(', ')}`,
            type: 'option',
          };
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            field: def.name,
            message: `${def.displayName || def.name} must be a boolean`,
            type: 'type',
          };
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            field: def.name,
            message: `${def.displayName || def.name} must be a number`,
            type: 'type',
          };
        }
        break;

      case 'multiselect':
        if (!Array.isArray(value)) {
          return {
            field: def.name,
            message: `${def.displayName || def.name} must be an array`,
            type: 'type',
          };
        }
        // Validate each option
        if (def.options) {
          for (const item of value) {
            if (!def.options.includes(item)) {
              return {
                field: def.name,
                message: `Invalid option "${item}" in ${def.displayName || def.name}. Must be one of: ${def.options.join(', ')}`,
                type: 'option',
              };
            }
          }
        }
        break;
    }

    return null;
  }

  /**
   * Validate additional constraints (pattern, min, max).
   */
  private validateConstraints(def: VariableDefinition, value: unknown): ValidationError | null {
    // Regex pattern validation for strings
    if (def.validation && typeof value === 'string') {
      try {
        const regex = new RegExp(def.validation);
        if (!regex.test(value)) {
          return {
            field: def.name,
            message: `${def.displayName || def.name} must match pattern: ${def.validation}`,
            type: 'pattern',
          };
        }
      } catch (e) {
        this.logger.warn(`Invalid regex pattern for ${def.name}: ${def.validation}`);
      }
    }

    // Min/max for numbers
    if (def.type === 'number' && typeof value === 'number') {
      if (def.min !== undefined && value < def.min) {
        return {
          field: def.name,
          message: `${def.displayName || def.name} must be at least ${def.min}`,
          type: 'range',
        };
      }
      if (def.max !== undefined && value > def.max) {
        return {
          field: def.name,
          message: `${def.displayName || def.name} must be at most ${def.max}`,
          type: 'range',
        };
      }
    }

    return null;
  }

  /**
   * Check if a value is truthy for conditional display.
   */
  private isTruthy(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.length > 0;
    if (typeof value === 'number') return value !== 0;
    return Boolean(value);
  }
}
