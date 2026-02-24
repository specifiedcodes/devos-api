/**
 * Template Creation Constants
 * Story 19-2: Template Creation Wizard (AC2)
 *
 * Default exclude patterns for template file scanning.
 */

/**
 * Default patterns to exclude when scanning files for template creation.
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.env*',
  '!.env.example',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
];

/**
 * Pattern detection rules for template variable suggestions.
 */
export const DETECTION_RULES = [
  {
    type: 'project_name',
    regex: /"name"\s*:\s*"([a-z][a-z0-9-]+)"/,
    suggestedVariable: 'project_name',
    confidence: 0.95,
    filePatterns: ['package.json'],
  },
  {
    type: 'database_url',
    regex: /(DATABASE_URL|POSTGRES_URL|MONGODB_URI|DB_URL)\s*[=:]\s*['"]([^'"]+)['"]/gi,
    suggestedVariable: 'database_url',
    confidence: 0.85,
  },
  {
    type: 'api_key',
    regex: /((STRIPE|OPENAI|ANTHROPIC|SENDGRID|AWS)_?(API_)?KEY|SECRET_KEY|API_SECRET)\s*[=:]\s*['"]([^'"]+)['"]/gi,
    suggestedVariable: 'api_key',
    confidence: 0.80,
  },
  {
    type: 'port',
    regex: /\b(PORT)\s*[=:]\s*(\d{4,5})\b/gi,
    suggestedVariable: 'port',
    confidence: 0.75,
  },
];
