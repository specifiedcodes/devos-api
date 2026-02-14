/**
 * Planner Agent Pipeline Prompt Template
 * Story 11.6: Planner Agent CLI Integration
 *
 * Specialized prompt template for the Planner Agent's real CLI execution pipeline.
 * Distinct from the generic PLANNER_AGENT_PROMPT_TEMPLATE (Story 11.3) by adding
 * explicit BMAD template formatting, sprint-status.yaml population commands,
 * file path conventions, commit message format, and structured document output.
 */

import { PlannerAgentExecutionParams } from '../interfaces/planner-agent-execution.interfaces';

// ─── Planning Task Sections ─────────────────────────────────────────────────

const TASK_SECTION_CREATE_PROJECT_PLAN = `## Planning Task: Create Project Plan

Generate a comprehensive project plan including:
1. **Product Brief** - Overview, target audience, value proposition, key features
2. **PRD (Product Requirements Document)** - Problem statement, requirements, success metrics
3. **Epic Breakdown** - Break the project into epics with descriptions
4. **Story Breakdown** - For the first epic, create detailed stories with acceptance criteria
5. **Architecture Document** - Tech stack, components, data model, API design

Write each document as a separate Markdown file in the appropriate directory.`;

const TASK_SECTION_BREAKDOWN_EPIC = `## Planning Task: Break Down Epic

Break the specified epic into detailed stories:
1. Analyze the epic description and identify all necessary implementation stories
2. Order stories by dependency (foundational stories first)
3. Each story should be implementable in 1-3 days by a single developer
4. Include detailed acceptance criteria for each story
5. Estimate complexity (S/M/L/XL) for each story

Write each story file in the implementation artifacts directory.`;

const TASK_SECTION_CREATE_STORIES = `## Planning Task: Create Stories

Create detailed story files for the specified epic:
1. Each story must include a clear user story statement (As a... I want... So that...)
2. Include numbered acceptance criteria with Given/When/Then format
3. Include a Tasks/Subtasks section with implementation breakdown
4. Include Dev Notes with references to existing code and architecture decisions
5. Set status to "ready-for-dev" for the first story, "backlog" for the rest

Write story files following the naming convention: {epicNumber}-{storyNumber}-{story-slug}.md`;

const TASK_SECTION_GENERATE_PRD = `## Planning Task: Generate PRD

Generate a Product Requirements Document including:
1. **Overview** - Product vision and scope
2. **Problem Statement** - What problem this solves and for whom
3. **Requirements** - Functional and non-functional requirements
4. **User Stories** - High-level user stories grouped by feature area
5. **Success Metrics** - How to measure if the product meets its goals
6. **Technical Constraints** - Known limitations and dependencies

Write the PRD as a single Markdown file in the planning artifacts directory.`;

const TASK_SECTION_GENERATE_ARCHITECTURE = `## Planning Task: Generate Architecture Document

Generate an Architecture document including:
1. **Tech Stack** - Languages, frameworks, databases, and infrastructure
2. **Components** - System components and their responsibilities
3. **Data Model** - Entity relationships and database schema
4. **API Design** - REST/GraphQL endpoints and contracts
5. **Security** - Authentication, authorization, and data protection
6. **Deployment** - Infrastructure, CI/CD, and monitoring

Write the architecture document as a Markdown file in the planning artifacts directory.`;

const TASK_SECTIONS: Record<string, string> = {
  'create-project-plan': TASK_SECTION_CREATE_PROJECT_PLAN,
  'breakdown-epic': TASK_SECTION_BREAKDOWN_EPIC,
  'create-stories': TASK_SECTION_CREATE_STORIES,
  'generate-prd': TASK_SECTION_GENERATE_PRD,
  'generate-architecture': TASK_SECTION_GENERATE_ARCHITECTURE,
};

// ─── Planner Agent Pipeline Prompt Template ─────────────────────────────────

export const PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE = `You are a senior technical product manager and architect working on planning documents for a real project.
Your output will be committed to the repository and used by development agents for implementation.

## Project: {{projectName}}

### Description
{{projectDescription}}

### Project Goals
{{projectGoals}}

### Tech Stack & Architecture
{{techStack}}

### Code Style Preferences
{{codeStylePreferences}}

{{taskSection}}

### BMAD Template Format Requirements

**Epic Files:**
- Must have a title (# heading) and description
- Must list stories with brief descriptions
- Stories should be ordered by dependency
- Include a summary section with total story count

**Story Files:**
- Must follow the format: Story {epicNumber}.{storyNumber}: {Title}
- Must include a user story statement: As a **{role}**, I want {feature}, So that {benefit}
- Must include numbered Acceptance Criteria with Given/When/Then or structured format
- Must include a Tasks/Subtasks section with implementation steps
- Must include a Dev Notes section with existing code references
- Must include estimated complexity: S (< 1 day), M (1-2 days), L (2-3 days), XL (3-5 days)

**PRD Files:**
- Must have Overview, Problem Statement, and Requirements sections
- Must have User Stories and Success Metrics sections

**Architecture Files:**
- Must have Tech Stack, Components, and Data Model sections
- Must have API Design and Security sections

### Sprint Status Update Instructions

After generating planning documents, update the sprint-status.yaml file:
- File location: \`{{workspacePath}}/_bmad-output/implementation-artifacts/sprint-status.yaml\`
- Add new stories under the correct epic section in \`development_status\`
- Story ID format: \`{epicNumber}-{storyNumber}\` (e.g., \`12-1\`, \`12-2\`)
- New stories should have status: \`backlog\`
- Epic status should be: \`in-progress\` when first story is created
- Preserve all existing entries and comments
- If the file does not exist, create it with standard header

### File Path Conventions

- Epic files: \`_bmad-output/planning-artifacts/epics/epic-{number}-{slug}.md\`
- Story files: \`_bmad-output/implementation-artifacts/{epicNumber}-{storyNumber}-{story-slug}.md\`
- PRD: \`_bmad-output/planning-artifacts/prd.md\`
- Architecture: \`_bmad-output/planning-artifacts/architecture.md\`
- Product Brief: \`_bmad-output/planning-artifacts/product-brief.md\`
- Sprint Status: \`_bmad-output/implementation-artifacts/sprint-status.yaml\`

### Dependency Ordering

- Order stories so foundational/infrastructure stories come first
- Stories that depend on others should reference their dependencies
- Data model stories before API stories
- API stories before UI stories
- Setup/config stories before feature stories

### Complexity Estimation

Estimate each story's complexity:
- **S** (Small): < 1 day, simple CRUD or config change
- **M** (Medium): 1-2 days, moderate feature with tests
- **L** (Large): 2-3 days, complex feature with multiple components
- **XL** (Extra Large): 3-5 days, cross-cutting concern or major feature

### Existing Context

**Existing Epics:**
{{existingEpics}}

**Existing Stories:**
{{existingStories}}

Do NOT recreate or duplicate any existing epics or stories listed above.

### Template Type
{{templateType}}

### Previous Planner Output
{{previousPlannerOutput}}

### Git Commit Instructions
- Commit all planning documents with message format: \`plan(devos-{{epicId}}): {{commitDescription}}\`
- Example: \`plan(devos-epic-12): Generate epic breakdown with 10 stories\`
- Make a single commit with all planning documents
- Do NOT push to remote - the pipeline will handle pushing

### Instructions
- You are working on the main branch
- Generate all planning documents following the BMAD template format above
- Update sprint-status.yaml with new story entries
- Commit all changes with the specified message format
- Be thorough - each story should have enough detail for a developer to implement independently`;

// ─── Prompt Builder ─────────────────────────────────────────────────────────

/**
 * Build a comprehensive prompt for the Planner Agent CLI session.
 * Replaces all template placeholders with actual values from execution params.
 *
 * @param params - Planner agent execution parameters with project context
 * @returns Fully-formatted prompt string ready for CLI session
 */
export function buildPlannerPipelinePrompt(
  params: PlannerAgentExecutionParams,
): string {
  const goalsFormatted =
    params.projectGoals.length > 0
      ? params.projectGoals.map((goal, i) => `${i + 1}. ${goal}`).join('\n')
      : 'No project goals specified';

  const taskSection =
    TASK_SECTIONS[params.planningTask] || TASK_SECTIONS['create-project-plan'];

  const existingEpicsFormatted =
    params.existingEpics.length > 0
      ? params.existingEpics.map((epic) => `- ${epic}`).join('\n')
      : 'None (this is a new project)';

  const existingStoriesFormatted =
    params.existingStories.length > 0
      ? params.existingStories.map((story) => `- ${story}`).join('\n')
      : 'None';

  const epicId = params.epicId || 'new';

  const commitDescription = getCommitDescription(params.planningTask);

  return PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE
    .replace(/\{\{projectName\}\}/g, params.projectName)
    .replace(/\{\{projectDescription\}\}/g, params.projectDescription || 'No description provided')
    .replace(/\{\{projectGoals\}\}/g, goalsFormatted)
    .replace(/\{\{techStack\}\}/g, params.techStack || 'Not specified')
    .replace(
      /\{\{codeStylePreferences\}\}/g,
      params.codeStylePreferences || 'Follow existing project conventions',
    )
    .replace(/\{\{taskSection\}\}/g, taskSection)
    .replace(/\{\{workspacePath\}\}/g, params.workspacePath)
    .replace(/\{\{existingEpics\}\}/g, existingEpicsFormatted)
    .replace(/\{\{existingStories\}\}/g, existingStoriesFormatted)
    .replace(
      /\{\{templateType\}\}/g,
      params.templateType || 'No specific template selected',
    )
    .replace(
      /\{\{previousPlannerOutput\}\}/g,
      params.previousPlannerOutput || 'No previous planner output available',
    )
    .replace(/\{\{epicId\}\}/g, epicId)
    .replace(/\{\{commitDescription\}\}/g, commitDescription);
}

/**
 * Get a human-readable commit description for a planning task type.
 */
function getCommitDescription(planningTask: string): string {
  const descriptions: Record<string, string> = {
    'create-project-plan': 'Generate project plan with epics and stories',
    'breakdown-epic': 'Break down epic into stories',
    'create-stories': 'Create story files with acceptance criteria',
    'generate-prd': 'Generate product requirements document',
    'generate-architecture': 'Generate architecture document',
  };
  return descriptions[planningTask] || 'Generate planning documents';
}
