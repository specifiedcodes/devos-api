/**
 * Built-in Test Scenarios
 *
 * Story 18-3: Agent Sandbox Testing
 *
 * Pre-built test scenarios for testing common agent behaviors.
 * These are seeded to workspaces for quick testing of agent capabilities.
 */

import { AgentDefinitionCategory } from '../../../database/entities/agent-definition.entity';

export interface BuiltInScenarioData {
  name: string;
  description: string | null;
  category: AgentDefinitionCategory | null;
  isBuiltIn: boolean;
  sampleInput: Record<string, unknown>;
  expectedBehavior: Record<string, unknown> | null;
  setupScript: string | null;
  validationScript: string | null;
  createdBy: string;
}

export const BUILT_IN_TEST_SCENARIOS: BuiltInScenarioData[] = [
  // Code Review scenarios
  {
    name: 'Security Vulnerability Detection',
    description: 'Test if agent can identify common security vulnerabilities in code',
    category: AgentDefinitionCategory.DEVELOPMENT,
    isBuiltIn: true,
    sampleInput: {
      code_file: 'sample-app/api/auth/login.ts',
      review_focus: 'security',
    },
    expectedBehavior: {
      should_find: ['SQL injection risk', 'Missing input validation', 'Hardcoded secrets'],
      tools_expected: ['github:read_files', 'github:create_review'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  {
    name: 'Performance Issue Detection',
    description: 'Test if agent can identify N+1 queries and performance anti-patterns',
    category: AgentDefinitionCategory.DEVELOPMENT,
    isBuiltIn: true,
    sampleInput: {
      code_file: 'sample-app/api/users/list.ts',
      review_focus: 'performance',
    },
    expectedBehavior: {
      should_find: ['N+1 query pattern', 'Missing database index suggestion'],
      tools_expected: ['github:read_files'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  {
    name: 'Code Style and Best Practices',
    description: 'Test if agent can identify code style issues and suggest improvements',
    category: AgentDefinitionCategory.DEVELOPMENT,
    isBuiltIn: true,
    sampleInput: {
      code_file: 'sample-app/services/user.service.ts',
      review_focus: 'style',
    },
    expectedBehavior: {
      should_check: ['Naming conventions', 'Code organization', 'Error handling patterns'],
      tools_expected: ['github:read_files'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  // Documentation scenarios
  {
    name: 'API Documentation Generation',
    description: 'Test if agent generates comprehensive API documentation',
    category: AgentDefinitionCategory.DOCUMENTATION,
    isBuiltIn: true,
    sampleInput: {
      module_path: 'sample-app/api/users',
      doc_format: 'openapi',
    },
    expectedBehavior: {
      should_include: ['Endpoint descriptions', 'Request/response schemas', 'Authentication requirements'],
      output_format: 'markdown',
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  {
    name: 'README Generation',
    description: 'Test if agent generates clear and complete README documentation',
    category: AgentDefinitionCategory.DOCUMENTATION,
    isBuiltIn: true,
    sampleInput: {
      project_root: 'sample-app',
      include_sections: ['installation', 'usage', 'configuration', 'contributing'],
    },
    expectedBehavior: {
      should_include: ['Installation steps', 'Usage examples', 'Configuration options'],
      output_format: 'markdown',
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  // QA scenarios
  {
    name: 'Test Case Generation',
    description: 'Test if agent generates comprehensive test cases',
    category: AgentDefinitionCategory.QA,
    isBuiltIn: true,
    sampleInput: {
      source_file: 'sample-app/services/user.service.ts',
      test_framework: 'jest',
    },
    expectedBehavior: {
      should_include: ['Happy path tests', 'Edge cases', 'Error handling tests'],
      tools_expected: ['github:read_files', 'github:write_files'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  {
    name: 'Integration Test Design',
    description: 'Test if agent designs comprehensive integration tests',
    category: AgentDefinitionCategory.QA,
    isBuiltIn: true,
    sampleInput: {
      api_endpoint: '/api/users',
      test_scenarios: ['create', 'read', 'update', 'delete'],
    },
    expectedBehavior: {
      should_include: ['Authentication tests', 'Authorization tests', 'Validation tests'],
      tools_expected: ['github:read_files'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  // DevOps scenarios
  {
    name: 'Deployment Script Review',
    description: 'Test if agent identifies deployment configuration issues',
    category: AgentDefinitionCategory.DEVOPS,
    isBuiltIn: true,
    sampleInput: {
      config_file: 'sample-app/docker-compose.yml',
      environment: 'production',
    },
    expectedBehavior: {
      should_check: ['Security best practices', 'Resource limits', 'Health checks'],
      tools_expected: ['github:read_files'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  {
    name: 'CI/CD Pipeline Optimization',
    description: 'Test if agent suggests CI/CD pipeline improvements',
    category: AgentDefinitionCategory.DEVOPS,
    isBuiltIn: true,
    sampleInput: {
      workflow_file: '.github/workflows/ci.yml',
      optimization_focus: 'speed',
    },
    expectedBehavior: {
      should_check: ['Caching strategies', 'Parallel execution', 'Build optimization'],
      tools_expected: ['github:read_files'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  // Security scenarios
  {
    name: 'Dependency Vulnerability Scan',
    description: 'Test if agent identifies vulnerable dependencies',
    category: AgentDefinitionCategory.SECURITY,
    isBuiltIn: true,
    sampleInput: {
      package_file: 'sample-app/package.json',
      scan_depth: 'deep',
    },
    expectedBehavior: {
      should_check: ['Known CVEs', 'Outdated packages', 'License compliance'],
      tools_expected: ['github:read_files'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  // Productivity scenarios
  {
    name: 'Code Refactoring Suggestions',
    description: 'Test if agent suggests meaningful code refactoring',
    category: AgentDefinitionCategory.PRODUCTIVITY,
    isBuiltIn: true,
    sampleInput: {
      source_file: 'sample-app/legacy/handler.ts',
      refactoring_goals: ['readability', 'maintainability'],
    },
    expectedBehavior: {
      should_include: ['Before/after comparison', 'Refactoring rationale', 'Migration steps'],
      tools_expected: ['github:read_files'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
  {
    name: 'Code Migration Assistant',
    description: 'Test if agent helps migrate code between frameworks',
    category: AgentDefinitionCategory.PRODUCTIVITY,
    isBuiltIn: true,
    sampleInput: {
      source_files: ['sample-app/pages/*.tsx'],
      from_framework: 'pages-router',
      to_framework: 'app-router',
    },
    expectedBehavior: {
      should_include: ['Migration mapping', 'Breaking changes', 'Code transformations'],
      tools_expected: ['github:read_files', 'github:write_files'],
    },
    setupScript: null,
    validationScript: null,
    createdBy: 'system',
  },
];

/**
 * Get built-in scenarios for a specific category
 */
export function getBuiltInScenariosForCategory(
  category: AgentDefinitionCategory,
): BuiltInScenarioData[] {
  return BUILT_IN_TEST_SCENARIOS.filter((s) => s.category === category);
}

/**
 * Get all built-in scenario names
 */
export function getBuiltInScenarioNames(): string[] {
  return BUILT_IN_TEST_SCENARIOS.map((s) => s.name);
}
