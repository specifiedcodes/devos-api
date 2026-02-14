/**
 * Dev Agent Pipeline Prompt Template
 * Story 11.4: Dev Agent CLI Integration
 *
 * Specialized prompt template for the Dev Agent's real CLI execution pipeline.
 * Distinct from the generic DEV_AGENT_PROMPT_TEMPLATE (Story 11.3) by adding
 * explicit Git commit message format, test execution commands, and PR
 * preparation instructions.
 */

import { DevAgentExecutionParams } from '../interfaces/dev-agent-execution.interfaces';

// ─── Dev Agent Pipeline Prompt Template ─────────────────────────────────────

export const DEV_AGENT_PIPELINE_PROMPT_TEMPLATE = `You are a senior software developer working on a feature implementation for a real codebase.
Your work will be committed, pushed, and submitted as a pull request.

## Story: {{storyTitle}}

### Description
{{storyDescription}}

### Acceptance Criteria
{{acceptanceCriteria}}

### Tech Stack
{{techStack}}

### Code Style & Conventions
{{codeStylePreferences}}

### Testing Strategy (TDD Required)
{{testingStrategy}}

**CRITICAL - Test-Driven Development Workflow:**
1. Write failing tests FIRST that cover each acceptance criterion
2. Run the tests to verify they fail (red phase)
3. Implement the minimum code to make tests pass (green phase)
4. Refactor while keeping all tests green (refactor phase)
5. Ensure test coverage >= 80% for all new code

### Git Commit Instructions
- Use descriptive commit messages in the format: \`feat(devos-{{storyId}}): <description>\`
- Make atomic commits - each commit should represent a logical unit of work
- Do NOT squash all changes into a single commit
- Reference the story ID ({{storyId}}) in every commit message

### Test Execution
- Run \`npm test\` before completing your work
- Ensure ALL tests pass (zero failures)
- If tests fail, fix them before completing
- Generate test coverage reports when possible

### Security & Best Practices
- Do NOT include hardcoded secrets, credentials, or API keys
- Do NOT commit .env files or sensitive configuration
- Follow existing code patterns and conventions in the project
- Use proper error handling and input validation
- Add appropriate logging for debugging

### Project Context
{{projectContext}}

### Existing Project Files
{{existingFiles}}

### Instructions
- You are already on a feature branch - do NOT create a new branch
- Write clean, well-documented code following the project conventions
- Implement ALL acceptance criteria - do not skip any
- Run all tests before completing
- Commit your changes with descriptive messages using the format above
- Do NOT push to remote - the pipeline will handle pushing`;

// ─── Prompt Builder ─────────────────────────────────────────────────────────

/**
 * Build a comprehensive prompt for the Dev Agent CLI session.
 * Replaces all template placeholders with actual values from execution params.
 *
 * @param params - Dev agent execution parameters with story context
 * @returns Fully-formatted prompt string ready for CLI session
 */
export function buildDevPipelinePrompt(
  params: DevAgentExecutionParams,
): string {
  const acceptanceCriteriaFormatted =
    params.acceptanceCriteria.length > 0
      ? params.acceptanceCriteria
          .map((ac, i) => `${i + 1}. ${ac}`)
          .join('\n')
      : 'No acceptance criteria specified';

  // Project context provides additional workspace-level context beyond what's
  // already in the tech stack and code style sections of the template.
  // Avoid duplicating techStack/codeStylePreferences since they have their own sections.
  const projectContext =
    params.techStack || params.codeStylePreferences
      ? `See Tech Stack and Code Style sections above for project conventions.`
      : 'No project context available';

  return DEV_AGENT_PIPELINE_PROMPT_TEMPLATE
    .replace(/\{\{storyTitle\}\}/g, params.storyTitle)
    .replace(/\{\{storyDescription\}\}/g, params.storyDescription)
    .replace(/\{\{acceptanceCriteria\}\}/g, acceptanceCriteriaFormatted)
    .replace(/\{\{techStack\}\}/g, params.techStack || 'Not specified')
    .replace(
      /\{\{codeStylePreferences\}\}/g,
      params.codeStylePreferences || 'Follow existing project conventions',
    )
    .replace(
      /\{\{testingStrategy\}\}/g,
      params.testingStrategy || 'TDD with Jest/Vitest',
    )
    .replace(/\{\{storyId\}\}/g, params.storyId)
    .replace(
      /\{\{projectContext\}\}/g,
      projectContext,
    )
    .replace(
      /\{\{existingFiles\}\}/g,
      'Explore the workspace to discover existing files and patterns',
    );
}
