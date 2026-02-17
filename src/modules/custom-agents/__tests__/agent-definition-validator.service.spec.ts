/**
 * AgentDefinitionValidatorService Tests
 *
 * Story 18-1: Agent Definition Schema
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AgentDefinitionValidatorService } from '../agent-definition-validator.service';
import { ModelRegistryService } from '../../model-registry/services/model-registry.service';
import { AGENT_DEFINITION_CONSTANTS } from '../constants/agent-definition.constants';

describe('AgentDefinitionValidatorService', () => {
  let service: AgentDefinitionValidatorService;
  let modelRegistryService: jest.Mocked<ModelRegistryService>;

  const validDefinition = {
    role: 'You are an expert code reviewer',
    system_prompt: 'Review code for best practices, security, and performance.',
    model_preferences: {
      preferred: 'claude-sonnet-4-20250514',
      fallback: 'gpt-4o',
      max_tokens: 4096,
      temperature: 0.3,
    },
    tools: {
      allowed: ['github:read_files', 'github:create_review'],
      denied: ['deployment:deploy_production'],
    },
    triggers: [
      { event: 'pr_created', auto_run: true },
    ],
    inputs: [
      { name: 'review_scope', type: 'select', options: ['full', 'security', 'performance'], default: 'full', required: true },
      { name: 'verbose', type: 'boolean', default: false },
    ],
    outputs: [
      { name: 'review_report', type: 'markdown', description: 'The code review report' },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentDefinitionValidatorService,
        {
          provide: ModelRegistryService,
          useValue: {
            findByModelId: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentDefinitionValidatorService>(AgentDefinitionValidatorService);
    modelRegistryService = module.get(ModelRegistryService) as jest.Mocked<ModelRegistryService>;
  });

  describe('validateDefinition', () => {
    it('should accept a valid complete definition', () => {
      const result = service.validateDefinition(validDefinition);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a minimal valid definition', () => {
      const minimal = {
        role: 'Test role',
        system_prompt: 'Test prompt',
        model_preferences: { preferred: 'test-model' },
      };
      const result = service.validateDefinition(minimal);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject definition missing required role field', () => {
      const def = { ...validDefinition } as Record<string, unknown>;
      delete def.role;
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].keyword).toBe('required');
    });

    it('should reject definition missing required system_prompt field', () => {
      const def = { ...validDefinition } as Record<string, unknown>;
      delete def.system_prompt;
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('system_prompt'))).toBe(true);
    });

    it('should reject definition missing required model_preferences field', () => {
      const def = { ...validDefinition } as Record<string, unknown>;
      delete def.model_preferences;
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('model_preferences'))).toBe(true);
    });

    it('should reject definition missing model_preferences.preferred', () => {
      const def = {
        ...validDefinition,
        model_preferences: { max_tokens: 1000 },
      };
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('preferred'))).toBe(true);
    });

    it('should reject system_prompt exceeding max length', () => {
      const def = {
        ...validDefinition,
        system_prompt: 'a'.repeat(AGENT_DEFINITION_CONSTANTS.MAX_SYSTEM_PROMPT_LENGTH + 1),
      };
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'maxLength')).toBe(true);
    });

    it('should reject invalid temperature value (negative)', () => {
      const def = {
        ...validDefinition,
        model_preferences: { ...validDefinition.model_preferences, temperature: -0.5 },
      };
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'minimum')).toBe(true);
    });

    it('should reject invalid temperature value (> 2.0)', () => {
      const def = {
        ...validDefinition,
        model_preferences: { ...validDefinition.model_preferences, temperature: 2.5 },
      };
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'maximum')).toBe(true);
    });

    it('should reject invalid max_tokens value (0)', () => {
      const def = {
        ...validDefinition,
        model_preferences: { ...validDefinition.model_preferences, max_tokens: 0 },
      };
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'minimum')).toBe(true);
    });

    it('should reject invalid max_tokens value (> 200000)', () => {
      const def = {
        ...validDefinition,
        model_preferences: { ...validDefinition.model_preferences, max_tokens: 300000 },
      };
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
    });

    it('should reject additional properties', () => {
      const def = { ...validDefinition, unknown_field: 'value' };
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.keyword === 'additionalProperties')).toBe(true);
    });

    it('should return user-friendly error messages with paths', () => {
      const def = { role: '', system_prompt: '', model_preferences: {} };
      const result = service.validateDefinition(def);
      expect(result.valid).toBe(false);
      for (const error of result.errors) {
        expect(error.path).toBeDefined();
        expect(error.message).toBeDefined();
        expect(error.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateModelReferences', () => {
    it('should return error for unknown model name', async () => {
      modelRegistryService.findByModelId.mockResolvedValue(null);
      const errors = await service.validateModelReferences(validDefinition);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('not registered');
    });

    it('should accept valid model names from registry', async () => {
      modelRegistryService.findByModelId.mockResolvedValue({
        modelId: 'claude-sonnet-4-20250514',
      } as any);
      const def = {
        ...validDefinition,
        model_preferences: { preferred: 'claude-sonnet-4-20250514' },
      };
      const errors = await service.validateModelReferences(def);
      expect(errors).toHaveLength(0);
    });

    it('should validate both preferred and fallback models', async () => {
      modelRegistryService.findByModelId
        .mockResolvedValueOnce({ modelId: 'claude-sonnet-4-20250514' } as any)
        .mockResolvedValueOnce(null);
      const errors = await service.validateModelReferences(validDefinition);
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe('/model_preferences/fallback');
    });

    it('should return empty for definition without model_preferences', async () => {
      const errors = await service.validateModelReferences({});
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateToolReferences', () => {
    it('should return error for unknown tool category', () => {
      const def = {
        ...validDefinition,
        tools: { allowed: ['unknown_category:some_tool'] },
      };
      const errors = service.validateToolReferences(def);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Unknown tool category');
    });

    it('should return error for unknown tool within known category', () => {
      const def = {
        ...validDefinition,
        tools: { allowed: ['github:nonexistent_tool'] },
      };
      const errors = service.validateToolReferences(def);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Unknown tool');
    });

    it('should accept wildcard category:* references', () => {
      const def = {
        ...validDefinition,
        tools: { allowed: ['github:*'] },
      };
      const errors = service.validateToolReferences(def);
      expect(errors).toHaveLength(0);
    });

    it('should detect conflicting allowed/denied entries', () => {
      const def = {
        ...validDefinition,
        tools: {
          allowed: ['github:read_files'],
          denied: ['github:read_files'],
        },
      };
      const errors = service.validateToolReferences(def);
      expect(errors.some(e => e.keyword === 'toolConflict')).toBe(true);
    });

    it('should accept valid tool references', () => {
      const def = {
        ...validDefinition,
        tools: {
          allowed: ['github:read_files', 'testing:run_unit_tests'],
          denied: ['deployment:deploy_production'],
        },
      };
      const errors = service.validateToolReferences(def);
      expect(errors).toHaveLength(0);
    });

    it('should return empty for definition without tools', () => {
      const def = { ...validDefinition };
      delete (def as any).tools;
      const errors = service.validateToolReferences(def);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateSystemPromptLength', () => {
    it('should return warning for very long prompts (>32000 chars)', () => {
      const def = {
        ...validDefinition,
        system_prompt: 'a'.repeat(33000),
      };
      const warnings = service.validateSystemPromptLength(def);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].type).toBe('recommendation');
    });

    it('should return no warnings for normal length prompts', () => {
      const def = {
        ...validDefinition,
        system_prompt: 'A normal prompt.',
      };
      const warnings = service.validateSystemPromptLength(def);
      expect(warnings).toHaveLength(0);
    });

    it('should return empty for definition without system_prompt', () => {
      const warnings = service.validateSystemPromptLength({});
      expect(warnings).toHaveLength(0);
    });
  });

  describe('validateInputs', () => {
    it('should return error for select input without options', () => {
      const def = {
        ...validDefinition,
        inputs: [{ name: 'test_input', type: 'select' }],
      };
      const errors = service.validateInputs(def);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].keyword).toBe('selectOptions');
    });

    it('should return error for duplicate input names', () => {
      const def = {
        ...validDefinition,
        inputs: [
          { name: 'my_input', type: 'text' },
          { name: 'my_input', type: 'number' },
        ],
      };
      const errors = service.validateInputs(def);
      expect(errors.some(e => e.keyword === 'uniqueInputName')).toBe(true);
    });

    it('should return error for type mismatch between default and input type', () => {
      const def = {
        ...validDefinition,
        inputs: [{ name: 'count', type: 'number', default: 'not a number' }],
      };
      const errors = service.validateInputs(def);
      expect(errors.some(e => e.keyword === 'defaultTypeMismatch')).toBe(true);
    });

    it('should accept valid inputs', () => {
      const def = {
        ...validDefinition,
        inputs: [
          { name: 'scope', type: 'select', options: ['full', 'partial'], default: 'full' },
          { name: 'verbose', type: 'boolean', default: false },
          { name: 'count', type: 'number', default: 10 },
          { name: 'label', type: 'text', default: 'hello' },
        ],
      };
      const errors = service.validateInputs(def);
      expect(errors).toHaveLength(0);
    });

    it('should return empty for definition without inputs', () => {
      const errors = service.validateInputs({});
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateTriggers', () => {
    it('should return warning for unknown trigger events', () => {
      const def = {
        ...validDefinition,
        triggers: [{ event: 'custom_unknown_event', auto_run: true }],
      };
      const warnings = service.validateTriggers(def);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].type).toBe('recommendation');
    });

    it('should detect duplicate trigger events', () => {
      const def = {
        ...validDefinition,
        triggers: [
          { event: 'pr_created', auto_run: true },
          { event: 'pr_created', auto_run: false },
        ],
      };
      const warnings = service.validateTriggers(def);
      expect(warnings.some(w => w.message.includes('Duplicate'))).toBe(true);
    });

    it('should return no warnings for known trigger events', () => {
      const def = {
        ...validDefinition,
        triggers: [
          { event: 'pr_created', auto_run: true },
          { event: 'deploy_completed', auto_run: false },
        ],
      };
      const warnings = service.validateTriggers(def);
      expect(warnings).toHaveLength(0);
    });

    it('should return empty for definition without triggers', () => {
      const warnings = service.validateTriggers({});
      expect(warnings).toHaveLength(0);
    });
  });

  describe('getSchemaForVersion', () => {
    it('should return schema for v1', () => {
      const schema = service.getSchemaForVersion('v1');
      expect(schema).toBeDefined();
      expect((schema as any).$schema).toContain('json-schema');
    });

    it('should throw BadRequestException for unsupported version', () => {
      expect(() => service.getSchemaForVersion('v2')).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty version', () => {
      expect(() => service.getSchemaForVersion('invalid')).toThrow(BadRequestException);
    });
  });
});
