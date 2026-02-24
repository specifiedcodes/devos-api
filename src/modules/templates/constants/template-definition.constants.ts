/**
 * Template Definition Constants
 *
 * Story 19-1: Template Registry Backend
 *
 * Constants for template definition validation, limits, and supported values.
 */
export const TEMPLATE_DEFINITION_CONSTANTS = {
  // Schema versions
  CURRENT_SCHEMA_VERSION: 'v1',
  SUPPORTED_SCHEMA_VERSIONS: ['v1'],

  // Limits
  MAX_NAME_LENGTH: 100,
  MAX_DISPLAY_NAME_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_LONG_DESCRIPTION_LENGTH: 10000,
  MAX_VERSION_LENGTH: 50,
  MAX_TAGS: 20,
  MAX_TAG_LENGTH: 50,
  MAX_SCREENSHOTS: 10,
  MAX_VARIABLES: 50,
  MAX_POST_INSTALL_STEPS: 20,
  MAX_DEFINITIONS_PER_WORKSPACE: 100,

  // Rating constraints
  MIN_RATING: 0,
  MAX_RATING: 5,

  // Supported template categories
  CATEGORIES: [
    'web-app',
    'api',
    'mobile',
    'saas',
    'ecommerce',
    'blog',
    'ai-app',
    'realtime',
  ] as const,

  // Supported source types
  SOURCE_TYPES: ['git', 'archive', 'inline'] as const,

  // Supported variable types
  VARIABLE_TYPES: [
    'string',
    'select',
    'boolean',
    'number',
    'multiselect',
    'secret',
  ] as const,

  // Predefined icon options
  ICONS: [
    'layout-dashboard',
    'rocket',
    'shopping-cart',
    'smartphone',
    'server',
    'code',
    'database',
    'cloud',
    'zap',
    'globe',
    'layers',
    'package',
    'terminal',
    'file-text',
    'bot',
    'cpu',
    'lock',
    'star',
    'heart',
    'bookmark',
    'folder',
    'git-branch',
    'settings',
  ] as const,

  // Default sort options
  SORT_FIELDS: ['createdAt', 'updatedAt', 'name', 'totalUses', 'avgRating'] as const,
  SORT_ORDERS: ['ASC', 'DESC'] as const,
} as const;

/**
 * JSON Schema for v1 Template Definition validation.
 * Used by TemplateValidatorService with ajv.
 */
export const TEMPLATE_DEFINITION_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['stack', 'variables', 'files'],
  additionalProperties: false,
  properties: {
    stack: {
      type: 'object',
      additionalProperties: false,
      properties: {
        frontend: { type: 'string', maxLength: 100 },
        backend: { type: 'string', maxLength: 100 },
        database: { type: 'string', maxLength: 100 },
        auth: { type: 'string', maxLength: 100 },
        styling: { type: 'string', maxLength: 100 },
        deployment: { type: 'string', maxLength: 100 },
      },
    },
    variables: {
      type: 'array',
      maxItems: TEMPLATE_DEFINITION_CONSTANTS.MAX_VARIABLES,
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
            enum: [...TEMPLATE_DEFINITION_CONSTANTS.VARIABLE_TYPES],
          },
          display_name: { type: 'string', maxLength: 255 },
          description: { type: 'string', maxLength: 500 },
          required: { type: 'boolean' },
          default: {},
          options: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
          validation: { type: 'string', maxLength: 500 },
          min: { type: 'number' },
          max: { type: 'number' },
          depends_on: { type: 'string', maxLength: 100 },
          group: { type: 'string', maxLength: 100 },
        },
      },
    },
    files: {
      type: 'object',
      required: ['source_type'],
      additionalProperties: false,
      properties: {
        source_type: {
          type: 'string',
          enum: [...TEMPLATE_DEFINITION_CONSTANTS.SOURCE_TYPES],
        },
        repository: { type: 'string', maxLength: 500 },
        branch: { type: 'string', maxLength: 100 },
        archive_url: { type: 'string', maxLength: 1000, format: 'uri' },
        inline_files: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
    },
    post_install: {
      type: 'array',
      maxItems: TEMPLATE_DEFINITION_CONSTANTS.MAX_POST_INSTALL_STEPS,
      items: { type: 'string', maxLength: 500 },
    },
  },
} as const;
