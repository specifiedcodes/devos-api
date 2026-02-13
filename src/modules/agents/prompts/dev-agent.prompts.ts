/**
 * Dev Agent Prompt Templates
 * Story 5.3: Dev Agent Implementation
 *
 * Structured prompts for each dev agent task type.
 * All prompts instruct Claude to return JSON-structured responses.
 */

import { DevAgentTask } from '../implementations/dev-agent.service';

/**
 * Shared system prompt for all Dev Agent task types
 */
export const DEV_AGENT_SYSTEM_PROMPT = `You are a Dev Agent - an autonomous AI software developer working on a project.
You write production-ready, well-tested, maintainable code.

Your capabilities:
- Implement user stories with full code generation
- Fix bugs with root cause analysis
- Write comprehensive test suites
- Refactor code for better quality

Rules:
- Always follow the project's tech stack and coding conventions
- Write TypeScript with strict type safety
- Include error handling in all generated code
- Generate tests alongside implementation code
- Return your response as valid JSON matching the required schema
- Do NOT include markdown code fences or any text outside the JSON object`;

/**
 * Build user prompt for implement-story task
 */
export function buildImplementStoryPrompt(task: DevAgentTask): string {
  const filesSection = task.files?.length
    ? `\nTarget files:\n${task.files.map((f) => `- ${f}`).join('\n')}`
    : '';

  const requirementsSection = task.requirements?.length
    ? `\nRequirements:\n${task.requirements.map((r) => `- ${r}`).join('\n')}`
    : '';

  return `Implement the following user story and return the result as a JSON object.

<user_input>
Story ID: ${task.storyId || 'N/A'}
Description: ${task.description}
${filesSection}
${requirementsSection}
</user_input>

Return a JSON object with this exact schema:
{
  "plan": "Brief implementation plan summary",
  "filesGenerated": ["list", "of", "file", "paths"],
  "codeBlocks": [
    {
      "filename": "path/to/file.ts",
      "language": "typescript",
      "content": "// full file content here"
    }
  ],
  "testsGenerated": true,
  "summary": "Human-readable summary of what was implemented"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for fix-bug task
 */
export function buildFixBugPrompt(task: DevAgentTask): string {
  const filesSection = task.files?.length
    ? `\nAffected files:\n${task.files.map((f) => `- ${f}`).join('\n')}`
    : '';

  return `Analyze and fix the following bug, then return the result as a JSON object.

<user_input>
Bug description: ${task.description}
${filesSection}
</user_input>

Return a JSON object with this exact schema:
{
  "rootCause": "Identified root cause of the bug",
  "fix": "Description of the fix applied",
  "filesModified": ["list", "of", "modified", "files"],
  "codeChanges": [
    {
      "filename": "path/to/file.ts",
      "language": "typescript",
      "content": "// full corrected file content here"
    }
  ],
  "testsAdded": true
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for write-tests task
 */
export function buildWriteTestsPrompt(task: DevAgentTask): string {
  const filesSection = task.files?.length
    ? `\nTarget files to test:\n${task.files.map((f) => `- ${f}`).join('\n')}`
    : '';

  return `Write comprehensive tests for the following and return the result as a JSON object.

<user_input>
Description: ${task.description}
${filesSection}
</user_input>

Return a JSON object with this exact schema:
{
  "testFiles": [
    {
      "filename": "path/to/file.spec.ts",
      "language": "typescript",
      "content": "// full test file content here",
      "testCount": 5
    }
  ],
  "totalTests": 5,
  "coverageEstimate": "high"
}

coverageEstimate must be one of: "high", "medium", "low".
Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for refactor task
 */
export function buildRefactorPrompt(task: DevAgentTask): string {
  const filesSection = task.files?.length
    ? `\nTarget files:\n${task.files.map((f) => `- ${f}`).join('\n')}`
    : '';

  return `Refactor the following code and return the result as a JSON object.

<user_input>
Description: ${task.description}
${filesSection}
</user_input>

Return a JSON object with this exact schema:
{
  "improvements": ["list", "of", "improvements", "made"],
  "filesModified": ["list", "of", "modified", "files"],
  "codeChanges": [
    {
      "filename": "path/to/file.ts",
      "language": "typescript",
      "content": "// full refactored file content here"
    }
  ],
  "qualityMetrics": {
    "complexityReduction": "Description of complexity reduction",
    "maintainabilityImprovement": "Description of maintainability improvement"
  }
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for code analysis
 */
export function buildAnalyzeCodePrompt(files: string[]): string {
  const filesSection = files.map((f) => `- ${f}`).join('\n');

  return `Analyze the following code files and return the result as a JSON object.

<user_input>
Files to analyze:
${filesSection}
</user_input>

Return a JSON object with this exact schema:
{
  "issues": [
    {
      "file": "path/to/file.ts",
      "line": 10,
      "severity": "high",
      "description": "Description of the issue"
    }
  ],
  "suggestions": [
    {
      "file": "path/to/file.ts",
      "description": "Suggestion for improvement"
    }
  ],
  "metrics": {
    "complexity": "low",
    "maintainability": "high"
  }
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for code generation
 */
export function buildGenerateCodePrompt(spec: string): string {
  return `Generate production-ready TypeScript code based on the following specification.

<user_input>
Specification:
${spec}
</user_input>

Return ONLY the generated TypeScript code, no markdown fences or additional text.`;
}
