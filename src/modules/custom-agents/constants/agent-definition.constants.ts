export const AGENT_DEFINITION_CONSTANTS = {
  // Schema versions
  CURRENT_SCHEMA_VERSION: 'v1',
  SUPPORTED_SCHEMA_VERSIONS: ['v1'],

  // Limits
  MAX_SYSTEM_PROMPT_LENGTH: 40000,      // ~10,000 tokens
  MAX_ROLE_LENGTH: 1000,
  MAX_TOOLS_ALLOWED: 50,
  MAX_TOOLS_DENIED: 50,
  MAX_TRIGGERS: 20,
  MAX_INPUTS: 20,
  MAX_OUTPUTS: 20,
  MAX_TAGS: 20,
  MAX_TAG_LENGTH: 50,
  MAX_DEFINITIONS_PER_WORKSPACE: 100,
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 100,

  // Model constraints
  MIN_TEMPERATURE: 0.0,
  MAX_TEMPERATURE: 2.0,
  MIN_MAX_TOKENS: 1,
  MAX_MAX_TOKENS: 200000,

  // Supported agent categories
  CATEGORIES: [
    'development',
    'qa',
    'devops',
    'documentation',
    'productivity',
    'security',
    'custom',
  ] as const,

  // Supported input types
  INPUT_TYPES: ['text', 'select', 'number', 'boolean'] as const,

  // Supported output types
  OUTPUT_TYPES: ['markdown', 'json', 'number', 'boolean', 'text'] as const,

  // Supported trigger events
  TRIGGER_EVENTS: [
    'pr_created',
    'pr_updated',
    'pr_merged',
    'deploy_started',
    'deploy_completed',
    'deploy_failed',
    'test_failed',
    'story_assigned',
    'manual',
    'scheduled',
  ] as const,

  // Known tool categories and their tools
  KNOWN_TOOL_CATEGORIES: {
    github: [
      'read_files',
      'write_files',
      'create_branch',
      'create_pr',
      'read_pr',
      'create_review',
      'merge_pr',
      'delete_branch',
    ],
    deployment: [
      'deploy_staging',
      'deploy_production',
      'rollback',
      'check_status',
    ],
    database: [
      'read_query',
      'write_query',
      'run_migration',
      'list_tables',
    ],
    filesystem: [
      'read',
      'write',
      'execute',
      'list_directory',
    ],
    testing: [
      'run_unit_tests',
      'run_integration_tests',
      'run_e2e_tests',
      'generate_tests',
    ],
    communication: [
      'send_notification',
      'post_comment',
      'send_message',
    ],
  } as Record<string, string[]>,

  // Predefined icon options
  ICONS: [
    'bot',
    'code',
    'shield-check',
    'bug',
    'file-text',
    'terminal',
    'rocket',
    'wrench',
    'search',
    'zap',
    'eye',
    'clipboard',
    'database',
    'git-branch',
    'package',
    'lock',
    'star',
    'cpu',
    'globe',
    'layers',
  ] as const,
} as const;

/**
 * JSON Schema for v1 Agent Definition validation.
 * Used by AgentDefinitionValidatorService with ajv.
 */
export const AGENT_DEFINITION_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['role', 'system_prompt', 'model_preferences'],
  additionalProperties: false,
  properties: {
    role: {
      type: 'string',
      minLength: 1,
      maxLength: AGENT_DEFINITION_CONSTANTS.MAX_ROLE_LENGTH,
      description: 'Short role description for the agent',
    },
    system_prompt: {
      type: 'string',
      minLength: 1,
      maxLength: AGENT_DEFINITION_CONSTANTS.MAX_SYSTEM_PROMPT_LENGTH,
      description: 'System prompt defining agent behavior',
    },
    model_preferences: {
      type: 'object',
      required: ['preferred'],
      additionalProperties: false,
      properties: {
        preferred: {
          type: 'string',
          minLength: 1,
          description: 'Preferred model identifier',
        },
        fallback: {
          type: 'string',
          minLength: 1,
          description: 'Fallback model identifier',
        },
        max_tokens: {
          type: 'integer',
          minimum: AGENT_DEFINITION_CONSTANTS.MIN_MAX_TOKENS,
          maximum: AGENT_DEFINITION_CONSTANTS.MAX_MAX_TOKENS,
          description: 'Maximum output tokens',
        },
        temperature: {
          type: 'number',
          minimum: AGENT_DEFINITION_CONSTANTS.MIN_TEMPERATURE,
          maximum: AGENT_DEFINITION_CONSTANTS.MAX_TEMPERATURE,
          description: 'Model temperature (0.0 = deterministic, 2.0 = creative)',
        },
      },
    },
    tools: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allowed: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^[a-z_]+:[a-z_*]+$',
          },
          maxItems: AGENT_DEFINITION_CONSTANTS.MAX_TOOLS_ALLOWED,
          uniqueItems: true,
          description: 'Allowed tool references (format: "category:tool_name" or "category:*")',
        },
        denied: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^[a-z_]+:[a-z_*]+$',
          },
          maxItems: AGENT_DEFINITION_CONSTANTS.MAX_TOOLS_DENIED,
          uniqueItems: true,
          description: 'Denied tool references (format: "category:tool_name" or "category:*")',
        },
      },
    },
    triggers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['event', 'auto_run'],
        additionalProperties: false,
        properties: {
          event: {
            type: 'string',
            minLength: 1,
          },
          auto_run: {
            type: 'boolean',
          },
        },
      },
      maxItems: AGENT_DEFINITION_CONSTANTS.MAX_TRIGGERS,
    },
    inputs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type'],
        additionalProperties: false,
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            pattern: '^[a-z][a-z0-9_]*$',
          },
          type: {
            type: 'string',
            enum: ['text', 'select', 'number', 'boolean'],
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
          default: {},
          required: {
            type: 'boolean',
          },
          description: {
            type: 'string',
            maxLength: 500,
          },
        },
      },
      maxItems: AGENT_DEFINITION_CONSTANTS.MAX_INPUTS,
    },
    outputs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type'],
        additionalProperties: false,
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            pattern: '^[a-z][a-z0-9_]*$',
          },
          type: {
            type: 'string',
            enum: ['markdown', 'json', 'number', 'boolean', 'text'],
          },
          description: {
            type: 'string',
            maxLength: 500,
          },
        },
      },
      maxItems: AGENT_DEFINITION_CONSTANTS.MAX_OUTPUTS,
    },
  },
} as const;
