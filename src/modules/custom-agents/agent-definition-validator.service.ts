/**
 * AgentDefinitionValidatorService
 *
 * Story 18-1: Agent Definition Schema
 *
 * Validates agent definition specs against JSON Schema (v1) using ajv.
 * Also performs semantic validations: model references, tool references,
 * system prompt length, inputs, and triggers.
 */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import Ajv from 'ajv';
import { ModelRegistryService } from '../model-registry/services/model-registry.service';
import { AGENT_DEFINITION_CONSTANTS, AGENT_DEFINITION_JSON_SCHEMA } from './constants/agent-definition.constants';
import {
  AgentDefinitionValidationResult,
  AgentDefinitionValidationError,
  AgentDefinitionValidationWarning,
} from './interfaces/agent-definition.interfaces';

@Injectable()
export class AgentDefinitionValidatorService {
  private readonly logger = new Logger(AgentDefinitionValidatorService.name);
  private readonly ajv: Ajv;
  private readonly compiledSchemas = new Map<string, ReturnType<Ajv['compile']>>();

  constructor(
    private readonly modelRegistryService: ModelRegistryService,
  ) {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
  }

  /**
   * Validate a definition against the JSON Schema and run semantic validations.
   */
  validateDefinition(
    definition: Record<string, unknown>,
    schemaVersion?: string,
  ): AgentDefinitionValidationResult {
    const version = schemaVersion || AGENT_DEFINITION_CONSTANTS.CURRENT_SCHEMA_VERSION;
    const schema = this.getSchemaForVersion(version);

    // Cache compiled schema per version to avoid recompilation on every call
    let validate = this.compiledSchemas.get(version);
    if (!validate) {
      validate = this.ajv.compile(schema);
      this.compiledSchemas.set(version, validate);
    }
    const valid = validate(definition);

    const errors: AgentDefinitionValidationError[] = [];
    const warnings: AgentDefinitionValidationWarning[] = [];

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
    const toolErrors = this.validateToolReferences(definition);
    errors.push(...toolErrors);

    const inputErrors = this.validateInputs(definition);
    errors.push(...inputErrors);

    const promptWarnings = this.validateSystemPromptLength(definition);
    warnings.push(...promptWarnings);

    const triggerWarnings = this.validateTriggers(definition);
    warnings.push(...triggerWarnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate model references against the model registry.
   */
  async validateModelReferences(
    definition: Record<string, unknown>,
  ): Promise<AgentDefinitionValidationError[]> {
    const errors: AgentDefinitionValidationError[] = [];
    const modelPrefs = definition.model_preferences as Record<string, unknown> | undefined;

    if (!modelPrefs) return errors;

    const modelsToCheck: Array<{ name: string; path: string }> = [];

    if (modelPrefs.preferred && typeof modelPrefs.preferred === 'string') {
      modelsToCheck.push({ name: modelPrefs.preferred, path: '/model_preferences/preferred' });
    }

    if (modelPrefs.fallback && typeof modelPrefs.fallback === 'string') {
      modelsToCheck.push({ name: modelPrefs.fallback, path: '/model_preferences/fallback' });
    }

    for (const model of modelsToCheck) {
      const found = await this.modelRegistryService.findByModelId(model.name);
      if (!found) {
        errors.push({
          path: model.path,
          message: `Model '${model.name}' is not registered in the platform`,
          keyword: 'modelReference',
        });
      }
    }

    return errors;
  }

  /**
   * Validate tool references against known tool categories.
   */
  validateToolReferences(
    definition: Record<string, unknown>,
  ): AgentDefinitionValidationError[] {
    const errors: AgentDefinitionValidationError[] = [];
    const tools = definition.tools as Record<string, unknown> | undefined;

    if (!tools) return errors;

    const allowed = (tools.allowed as string[]) || [];
    const denied = (tools.denied as string[]) || [];
    const knownCategories = AGENT_DEFINITION_CONSTANTS.KNOWN_TOOL_CATEGORIES;

    const validateToolList = (list: string[], listName: string) => {
      for (let i = 0; i < list.length; i++) {
        const ref = list[i];
        const parts = ref.split(':');
        if (parts.length !== 2) continue; // schema already validates format

        const [category, toolName] = parts;

        if (!knownCategories[category]) {
          errors.push({
            path: `/tools/${listName}/${i}`,
            message: `Unknown tool category '${category}'`,
            keyword: 'toolReference',
          });
          continue;
        }

        if (toolName !== '*' && !knownCategories[category].includes(toolName)) {
          errors.push({
            path: `/tools/${listName}/${i}`,
            message: `Unknown tool '${toolName}' in category '${category}'`,
            keyword: 'toolReference',
          });
        }
      }
    };

    validateToolList(allowed, 'allowed');
    validateToolList(denied, 'denied');

    // Check for conflicts: tool in both allowed and denied lists
    const allowedSet = new Set(allowed);
    for (const ref of denied) {
      if (allowedSet.has(ref)) {
        errors.push({
          path: '/tools',
          message: `Tool '${ref}' is in both allowed and denied lists`,
          keyword: 'toolConflict',
        });
      }
    }

    return errors;
  }

  /**
   * Validate system prompt length and generate warnings.
   */
  validateSystemPromptLength(
    definition: Record<string, unknown>,
  ): AgentDefinitionValidationWarning[] {
    const warnings: AgentDefinitionValidationWarning[] = [];
    const systemPrompt = definition.system_prompt as string | undefined;

    if (!systemPrompt) return warnings;

    // Rough token estimate: chars / 4
    const estimatedTokens = Math.ceil(systemPrompt.length / 4);

    if (estimatedTokens > 8000) {
      warnings.push({
        path: '/system_prompt',
        message: `System prompt is very long (~${estimatedTokens} tokens), consider summarizing`,
        type: 'recommendation',
      });
    }

    return warnings;
  }

  /**
   * Validate inputs for semantic correctness.
   */
  validateInputs(
    definition: Record<string, unknown>,
  ): AgentDefinitionValidationError[] {
    const errors: AgentDefinitionValidationError[] = [];
    const inputs = definition.inputs as Array<Record<string, unknown>> | undefined;

    if (!inputs || !Array.isArray(inputs)) return errors;

    const seenNames = new Set<string>();

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const name = input.name as string;
      const type = input.type as string;

      // Check for duplicate names
      if (seenNames.has(name)) {
        errors.push({
          path: `/inputs/${i}/name`,
          message: `Duplicate input name '${name}'`,
          keyword: 'uniqueInputName',
        });
      }
      seenNames.add(name);

      // For select type: verify options array is provided
      if (type === 'select') {
        const options = input.options as string[] | undefined;
        if (!options || !Array.isArray(options) || options.length === 0) {
          errors.push({
            path: `/inputs/${i}/options`,
            message: `Input '${name}' of type 'select' must have a non-empty 'options' array`,
            keyword: 'selectOptions',
          });
        }
      }

      // For inputs with default: verify default matches type
      if (input.default !== undefined) {
        const defaultVal = input.default;
        let valid = true;

        switch (type) {
          case 'text':
          case 'select':
            valid = typeof defaultVal === 'string';
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
            path: `/inputs/${i}/default`,
            message: `Default value for input '${name}' does not match type '${type}'`,
            keyword: 'defaultTypeMismatch',
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validate triggers for known events and duplicates.
   */
  validateTriggers(
    definition: Record<string, unknown>,
  ): AgentDefinitionValidationWarning[] {
    const warnings: AgentDefinitionValidationWarning[] = [];
    const triggers = definition.triggers as Array<Record<string, unknown>> | undefined;

    if (!triggers || !Array.isArray(triggers)) return warnings;

    const knownEvents = new Set<string>(AGENT_DEFINITION_CONSTANTS.TRIGGER_EVENTS);
    const seenEvents = new Set<string>();

    for (let i = 0; i < triggers.length; i++) {
      const event = triggers[i].event as string;

      // Check for unknown events (warning, not error)
      if (!knownEvents.has(event)) {
        warnings.push({
          path: `/triggers/${i}/event`,
          message: `Unknown trigger event '${event}'. Known events: ${[...knownEvents].join(', ')}`,
          type: 'recommendation',
        });
      }

      // Check for duplicate events
      if (seenEvents.has(event)) {
        warnings.push({
          path: `/triggers/${i}/event`,
          message: `Duplicate trigger event '${event}'`,
          type: 'recommendation',
        });
      }
      seenEvents.add(event);
    }

    return warnings;
  }

  /**
   * Get the JSON Schema for a given version.
   */
  getSchemaForVersion(version: string): object {
    if (!(AGENT_DEFINITION_CONSTANTS.SUPPORTED_SCHEMA_VERSIONS as unknown as string[]).includes(version)) {
      throw new BadRequestException(
        `Unsupported schema version '${version}'. Supported versions: ${AGENT_DEFINITION_CONSTANTS.SUPPORTED_SCHEMA_VERSIONS.join(', ')}`,
      );
    }

    // Currently only v1 is supported
    return AGENT_DEFINITION_JSON_SCHEMA;
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
      case 'uniqueItems':
        return `Array at ${path} must contain unique items`;
      default:
        return (err.message as string) || `Validation error at ${path}`;
    }
  }
}
