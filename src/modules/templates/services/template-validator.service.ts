/**
 * TemplateValidatorService
 *
 * Story 19-1: Template Registry Backend
 *
 * Validates template definition specs against JSON Schema (v1) using ajv.
 * Also performs semantic validations: stack structure, variables, and files config.
 */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  TEMPLATE_DEFINITION_CONSTANTS,
  TEMPLATE_DEFINITION_JSON_SCHEMA,
} from '../constants/template-definition.constants';
import {
  TemplateValidationResult,
  TemplateValidationError,
  TemplateValidationWarning,
} from '../interfaces/template.interfaces';

@Injectable()
export class TemplateValidatorService {
  private readonly logger = new Logger(TemplateValidatorService.name);
  private readonly ajv: Ajv;
  private readonly compiledSchemas = new Map<string, ReturnType<Ajv['compile']>>();

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
  }

  /**
   * Validate a definition against the JSON Schema and run semantic validations.
   */
  validateDefinition(
    definition: Record<string, unknown>,
    schemaVersion?: string,
  ): TemplateValidationResult {
    const version = schemaVersion || TEMPLATE_DEFINITION_CONSTANTS.CURRENT_SCHEMA_VERSION;
    const schema = this.getSchemaForVersion(version);

    // Cache compiled schema per version to avoid recompilation on every call
    let validate = this.compiledSchemas.get(version);
    if (!validate) {
      validate = this.ajv.compile(schema);
      this.compiledSchemas.set(version, validate);
    }
    const valid = validate(definition);

    const errors: TemplateValidationError[] = [];
    const warnings: TemplateValidationWarning[] = [];

    if (!valid && validate.errors) {
      for (const err of validate.errors) {
        errors.push({
          path: err.instancePath || '/',
          message: this.formatAjvError(err as unknown as Record<string, unknown>),
          keyword: err.keyword,
          params: err.params as Record<string, unknown>,
        });
      }
      return { valid: false, errors, warnings };
    }

    // Run semantic validations if schema is valid
    const stackErrors = this.validateStack(definition);
    errors.push(...stackErrors);

    const variableErrors = this.validateVariables(definition);
    errors.push(...variableErrors);

    const filesErrors = this.validateFiles(definition);
    errors.push(...filesErrors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate stack configuration.
   */
  validateStack(definition: Record<string, unknown>): TemplateValidationError[] {
    const errors: TemplateValidationError[] = [];
    const stack = definition.stack as Record<string, unknown> | undefined;

    if (!stack) {
      errors.push({
        path: '/stack',
        message: 'Stack configuration is required',
        keyword: 'required',
      });
      return errors;
    }

    // At least one stack component should be defined
    const components = ['frontend', 'backend', 'database', 'auth', 'styling', 'deployment'];
    const hasAnyComponent = components.some((c) => stack[c] && typeof stack[c] === 'string');

    if (!hasAnyComponent) {
      errors.push({
        path: '/stack',
        message: 'At least one stack component should be defined',
        keyword: 'minProperties',
      });
    }

    return errors;
  }

  /**
   * Validate template variables.
   */
  validateVariables(definition: Record<string, unknown>): TemplateValidationError[] {
    const errors: TemplateValidationError[] = [];
    const variables = definition.variables as Array<Record<string, unknown>> | undefined;

    if (!variables || !Array.isArray(variables)) {
      return errors; // Schema already validates this
    }

    const seenNames = new Set<string>();
    const validTypes = TEMPLATE_DEFINITION_CONSTANTS.VARIABLE_TYPES;

    for (let i = 0; i < variables.length; i++) {
      const variable = variables[i];
      const name = variable.name as string;
      const type = variable.type as string;

      // Check for duplicate names
      if (seenNames.has(name)) {
        errors.push({
          path: `/variables/${i}/name`,
          message: `Duplicate variable name '${name}'`,
          keyword: 'uniqueVariableName',
        });
      }
      seenNames.add(name);

      // Validate type
      if (!validTypes.includes(type as 'string' | 'select' | 'boolean' | 'number' | 'multiselect' | 'secret')) {
        errors.push({
          path: `/variables/${i}/type`,
          message: `Invalid variable type '${type}'. Must be one of: ${validTypes.join(', ')}`,
          keyword: 'enum',
        });
      }

      // For select/multiselect type: verify options array is provided
      if (type === 'select' || type === 'multiselect') {
        const options = variable.options as string[] | undefined;
        if (!options || !Array.isArray(options) || options.length === 0) {
          errors.push({
            path: `/variables/${i}/options`,
            message: `Variable '${name}' of type '${type}' must have a non-empty 'options' array`,
            keyword: 'selectOptions',
          });
        }
      }

      // For number type: validate min/max if present
      if (type === 'number') {
        const min = variable.min as number | undefined;
        const max = variable.max as number | undefined;
        if (min !== undefined && max !== undefined && min > max) {
          errors.push({
            path: `/variables/${i}`,
            message: `Variable '${name}': min (${min}) cannot be greater than max (${max})`,
            keyword: 'minMax',
          });
        }
      }

      // For variables with default: verify default matches type
      if (variable.default !== undefined) {
        const defaultVal = variable.default;
        let valid = true;

        switch (type) {
          case 'string':
          case 'secret':
            valid = typeof defaultVal === 'string';
            break;
          case 'select':
            valid = typeof defaultVal === 'string';
            // Also check if default is in options
            if (valid && Array.isArray(variable.options)) {
              valid = (variable.options as string[]).includes(defaultVal as string);
            }
            break;
          case 'multiselect':
            valid =
              Array.isArray(defaultVal) &&
              (defaultVal as string[]).every((d) =>
                (variable.options as string[] | undefined)?.includes(d),
              );
            break;
          case 'number':
            valid = typeof defaultVal === 'number';
            break;
          case 'boolean':
            valid = typeof defaultVal === 'boolean';
            break;
        }

        if (!valid) {
          errors.push({
            path: `/variables/${i}/default`,
            message: `Default value for variable '${name}' does not match type '${type}'`,
            keyword: 'defaultTypeMismatch',
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validate files configuration.
   */
  validateFiles(definition: Record<string, unknown>): TemplateValidationError[] {
    const errors: TemplateValidationError[] = [];
    const files = definition.files as Record<string, unknown> | undefined;

    if (!files) {
      errors.push({
        path: '/files',
        message: 'Files configuration is required',
        keyword: 'required',
      });
      return errors;
    }

    const sourceType = files.source_type as string;

    // Validate based on source type
    switch (sourceType) {
      case 'git':
        if (!files.repository && !definition.source_url) {
          errors.push({
            path: '/files/repository',
            message: 'Repository URL is required for git source type',
            keyword: 'required',
          });
        }
        break;
      case 'archive':
        if (!files.archive_url && !definition.source_url) {
          errors.push({
            path: '/files/archive_url',
            message: 'Archive URL is required for archive source type',
            keyword: 'required',
          });
        }
        break;
      case 'inline':
        if (!files.inline_files || Object.keys(files.inline_files as object).length === 0) {
          errors.push({
            path: '/files/inline_files',
            message: 'At least one inline file is required for inline source type',
            keyword: 'required',
          });
        }
        break;
      default:
        errors.push({
          path: '/files/source_type',
          message: `Invalid source type '${sourceType}'. Must be one of: git, archive, inline`,
          keyword: 'enum',
        });
    }

    return errors;
  }

  /**
   * Get the JSON Schema for a given version.
   */
  getSchemaForVersion(version: string): object {
    if (!(TEMPLATE_DEFINITION_CONSTANTS.SUPPORTED_SCHEMA_VERSIONS as unknown as string[]).includes(version)) {
      throw new BadRequestException(
        `Unsupported schema version '${version}'. Supported versions: ${TEMPLATE_DEFINITION_CONSTANTS.SUPPORTED_SCHEMA_VERSIONS.join(', ')}`,
      );
    }

    // Currently only v1 is supported
    return TEMPLATE_DEFINITION_JSON_SCHEMA;
  }

  /**
   * Format ajv error into user-friendly message.
   */
  private formatAjvError(err: Record<string, unknown>): string {
    const keyword = err.keyword as string;
    const params = err.params as Record<string, unknown>;
    const path = (err.instancePath as string) || '/';

    switch (keyword) {
      case 'required':
        return `Missing required property '${params.missingProperty}' at ${path}`;
      case 'additionalProperties':
        return `Unexpected property '${params.additionalProperty}' at ${path}`;
      case 'type':
        return `Expected type '${params.type}' at ${path}`;
      case 'minLength':
        return `Value at ${path} must not be empty`;
      case 'maxLength':
        return `Value at ${path} exceeds maximum length of ${params.limit}`;
      case 'minimum':
        return `Value at ${path} must be >= ${params.limit}`;
      case 'maximum':
        return `Value at ${path} must be <= ${params.limit}`;
      case 'pattern':
        return `Value at ${path} does not match required pattern`;
      case 'enum':
        return `Value at ${path} must be one of: ${(params.allowedValues as string[])?.join(', ')}`;
      case 'maxItems':
        return `Array at ${path} exceeds maximum of ${params.limit} items`;
      case 'minItems':
        return `Array at ${path} must have at least ${params.limit} items`;
      case 'uniqueItems':
        return `Array at ${path} must contain unique items`;
      case 'format':
        return `Value at ${path} does not match format '${params.format}'`;
      default:
        return (err.message as string) || `Validation error at ${path}`;
    }
  }
}
