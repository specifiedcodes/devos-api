/**
 * Planner Agent Prompt Templates
 * Story 5.4: Planner Agent Implementation
 *
 * Structured prompts for each planner agent task type.
 * All prompts instruct Claude to return JSON-structured responses.
 */

import { PlannerAgentTask } from '../interfaces/planner-agent.interfaces';

/**
 * Shared system prompt for all Planner Agent task types
 */
export const PLANNER_AGENT_SYSTEM_PROMPT = `You are a Planner Agent - an autonomous AI project planner following the BMAD (Build Measure Analyze Decide) methodology.
You create comprehensive, actionable plans for software projects.

Your capabilities:
- Create detailed implementation plans with phases and milestones
- Break down epics into well-defined user stories with acceptance criteria
- Generate Product Requirements Documents (PRDs) from project descriptions
- Design high-level technical architectures

Rules:
- Follow BMAD methodology for planning and documentation
- Create actionable, specific deliverables (not vague descriptions)
- Include risk assessment and mitigation strategies
- Define clear acceptance criteria for every story
- Estimate effort realistically (small, medium, large, extra-large)
- Identify dependencies between work items
- Return your response as valid JSON matching the required schema
- Do NOT include markdown code fences or any text outside the JSON object`;

/**
 * Build user prompt for create-plan task
 */
export function buildCreatePlanPrompt(task: PlannerAgentTask): string {
  const goalsSection = task.goals?.length
    ? `\nGoals:\n${task.goals.map((g) => `- ${g}`).join('\n')}`
    : '';

  const constraintsSection = task.constraints?.length
    ? `\nConstraints:\n${task.constraints.map((c) => `- ${c}`).join('\n')}`
    : '';

  const techStackSection = task.techStack?.length
    ? `\nTech Stack:\n${task.techStack.map((t) => `- ${t}`).join('\n')}`
    : '';

  const sections = [
    `Project Description: ${task.projectDescription || task.description}`,
    goalsSection,
    constraintsSection,
    techStackSection,
  ].filter(Boolean).join('\n');

  return `Create a comprehensive implementation plan for the following project and return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "plan": {
    "summary": "Brief plan summary",
    "phases": [
      {
        "name": "Phase name",
        "description": "Phase description",
        "estimatedEffort": "small|medium|large|extra-large",
        "dependencies": ["list of dependency names"]
      }
    ],
    "milestones": [
      {
        "name": "Milestone name",
        "criteria": "Completion criteria"
      }
    ]
  },
  "risks": [
    {
      "description": "Risk description",
      "severity": "high|medium|low",
      "mitigation": "Mitigation strategy"
    }
  ],
  "estimatedEffort": "Overall effort estimate",
  "summary": "Human-readable summary of the plan"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for breakdown-epic task
 */
export function buildBreakdownEpicPrompt(task: PlannerAgentTask): string {
  const goalsSection = task.goals?.length
    ? `\nGoals:\n${task.goals.map((g) => `- ${g}`).join('\n')}`
    : '';

  const constraintsSection = task.constraints?.length
    ? `\nConstraints:\n${task.constraints.map((c) => `- ${c}`).join('\n')}`
    : '';

  const sections = [
    `Epic ID: ${task.epicId || 'N/A'}`,
    `Epic Description: ${task.epicDescription || task.description}`,
    goalsSection,
    constraintsSection,
  ].filter(Boolean).join('\n');

  return `Break down the following epic into well-defined user stories and return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "stories": [
    {
      "title": "Story title",
      "description": "As a [user], I want [feature] so that [benefit]",
      "acceptanceCriteria": ["Given/When/Then criteria"],
      "estimatedEffort": "small|medium|large|extra-large",
      "priority": "high|medium|low",
      "dependencies": ["list of dependency story titles"]
    }
  ],
  "totalStories": 5,
  "summary": "Human-readable summary of the breakdown"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for generate-prd task
 */
export function buildGeneratePrdPrompt(task: PlannerAgentTask): string {
  const goalsSection = task.goals?.length
    ? `\nGoals:\n${task.goals.map((g) => `- ${g}`).join('\n')}`
    : '';

  const constraintsSection = task.constraints?.length
    ? `\nConstraints:\n${task.constraints.map((c) => `- ${c}`).join('\n')}`
    : '';

  const techStackSection = task.techStack?.length
    ? `\nTech Stack:\n${task.techStack.map((t) => `- ${t}`).join('\n')}`
    : '';

  const sections = [
    `Project Description: ${task.projectDescription || task.description}`,
    goalsSection,
    constraintsSection,
    techStackSection,
  ].filter(Boolean).join('\n');

  return `Generate a Product Requirements Document (PRD) for the following project and return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "prd": {
    "overview": "Project overview",
    "problemStatement": "Problem being solved",
    "goals": ["list of project goals"],
    "userPersonas": [
      {
        "name": "Persona name",
        "description": "Persona description",
        "needs": ["list of needs"]
      }
    ],
    "functionalRequirements": [
      {
        "id": "FR-001",
        "title": "Requirement title",
        "description": "Requirement description",
        "priority": "must-have|should-have|nice-to-have"
      }
    ],
    "nonFunctionalRequirements": ["list of NFRs"],
    "successMetrics": ["list of success metrics"]
  },
  "summary": "Human-readable summary of the PRD"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for generate-architecture task
 */
export function buildGenerateArchitecturePrompt(task: PlannerAgentTask): string {
  const constraintsSection = task.constraints?.length
    ? `\nConstraints:\n${task.constraints.map((c) => `- ${c}`).join('\n')}`
    : '';

  const techStackSection = task.techStack?.length
    ? `\nPreferred Tech Stack:\n${task.techStack.map((t) => `- ${t}`).join('\n')}`
    : '';

  const goalsSection = task.goals?.length
    ? `\nGoals:\n${task.goals.map((g) => `- ${g}`).join('\n')}`
    : '';

  const sections = [
    `Project Description: ${task.projectDescription || task.description}`,
    goalsSection,
    constraintsSection,
    techStackSection,
  ].filter(Boolean).join('\n');

  return `Generate a high-level technical architecture document for the following project and return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "architecture": {
    "overview": "Architecture overview",
    "techStack": [
      {
        "category": "Category (e.g., Frontend, Backend, Database)",
        "technology": "Technology name",
        "rationale": "Why this technology was chosen"
      }
    ],
    "components": [
      {
        "name": "Component name",
        "responsibility": "What this component does",
        "interfaces": ["list of interfaces/APIs exposed"]
      }
    ],
    "dataModel": "High-level data model description",
    "deploymentStrategy": "Deployment approach description"
  },
  "summary": "Human-readable summary of the architecture"
}

Return ONLY the JSON object, no markdown or additional text.`;
}
