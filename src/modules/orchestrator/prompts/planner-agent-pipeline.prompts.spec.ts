/**
 * Planner Agent Pipeline Prompt Tests
 * Story 11.6: Planner Agent CLI Integration
 *
 * Tests for buildPlannerPipelinePrompt function and template structure.
 */

import {
  buildPlannerPipelinePrompt,
  PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE,
} from './planner-agent-pipeline.prompts';
import { PlannerAgentExecutionParams } from '../interfaces/planner-agent-execution.interfaces';

describe('PlannerAgentPipelinePrompts', () => {
  const baseParams: PlannerAgentExecutionParams = {
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    storyId: null,
    projectName: 'DevOS',
    projectDescription: 'AI-powered development platform',
    projectGoals: [
      'Automate software development workflow',
      'Provide real-time code visibility',
      'Support multi-agent collaboration',
    ],
    epicId: 'epic-12',
    epicDescription: 'AI Memory & Context Management',
    planningTask: 'create-project-plan',
    techStack: 'NestJS, TypeScript, PostgreSQL, Redis',
    codeStylePreferences: 'ESLint + Prettier, 2-space indentation',
    templateType: 'saas-starter',
    workspacePath: '/tmp/workspaces/ws-123/proj-456',
    gitRepoUrl: 'https://github.com/owner/repo.git',
    githubToken: 'ghp_test_token',
    repoOwner: 'owner',
    repoName: 'repo',
    existingEpics: ['Epic 1: User Authentication', 'Epic 2: Workspace Management'],
    existingStories: ['1-1: Repository Setup', '1-2: PostgreSQL Setup'],
    previousPlannerOutput: null,
  };

  describe('PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE', () => {
    it('should contain all required placeholders', () => {
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{projectName}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{projectDescription}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{projectGoals}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{techStack}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{codeStylePreferences}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{taskSection}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{workspacePath}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{existingEpics}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{existingStories}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{templateType}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{previousPlannerOutput}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{epicId}}');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{commitDescription}}');
    });

    it('should include BMAD template format requirements', () => {
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('BMAD Template Format');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('Given/When/Then');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('Tasks/Subtasks');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('Acceptance Criteria');
    });

    it('should include sprint-status.yaml update instructions', () => {
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('sprint-status.yaml');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('development_status');
    });

    it('should include commit message format', () => {
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('plan(devos-{{epicId}})');
    });

    it('should include file path conventions', () => {
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('planning-artifacts/epics');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('implementation-artifacts');
    });

    it('should include complexity estimation instructions', () => {
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('Complexity Estimation');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('Small');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('Medium');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('Large');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('Extra Large');
    });

    it('should include dependency ordering instructions', () => {
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('Dependency Ordering');
      expect(PLANNER_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('foundational');
    });
  });

  describe('buildPlannerPipelinePrompt', () => {
    it('should include project name and description', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('DevOS');
      expect(prompt).toContain('AI-powered development platform');
    });

    it('should include project goals as numbered list', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('1. Automate software development workflow');
      expect(prompt).toContain('2. Provide real-time code visibility');
      expect(prompt).toContain('3. Support multi-agent collaboration');
    });

    it('should include BMAD template format requirements', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('BMAD Template Format');
      expect(prompt).toContain('Given/When/Then');
    });

    it('should include sprint-status.yaml update instructions', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('sprint-status.yaml');
      expect(prompt).toContain(baseParams.workspacePath);
    });

    it('should include existing epics/stories context', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('Epic 1: User Authentication');
      expect(prompt).toContain('Epic 2: Workspace Management');
      expect(prompt).toContain('1-1: Repository Setup');
      expect(prompt).toContain('1-2: PostgreSQL Setup');
    });

    it('should include commit message format instructions', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('plan(devos-epic-12)');
    });

    it('should include tech stack and architecture preferences', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('NestJS, TypeScript, PostgreSQL, Redis');
      expect(prompt).toContain('ESLint + Prettier');
    });

    it('should include previous planner output when available', () => {
      const params = {
        ...baseParams,
        previousPlannerOutput: 'Previously generated Epic 11 with 10 stories',
      };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('Previously generated Epic 11 with 10 stories');
    });

    it('should handle empty project goals gracefully', () => {
      const params = {
        ...baseParams,
        projectGoals: [],
      };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('No project goals specified');
    });

    it('should use correct prompt section for create-project-plan task type', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('Create Project Plan');
      expect(prompt).toContain('Product Brief');
    });

    it('should use correct prompt section for breakdown-epic task type', () => {
      const params = { ...baseParams, planningTask: 'breakdown-epic' as const };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('Break Down Epic');
    });

    it('should use correct prompt section for create-stories task type', () => {
      const params = { ...baseParams, planningTask: 'create-stories' as const };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('Create Stories');
      expect(prompt).toContain('user story statement');
    });

    it('should use correct prompt section for generate-prd task type', () => {
      const params = { ...baseParams, planningTask: 'generate-prd' as const };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('Generate PRD');
      expect(prompt).toContain('Problem Statement');
    });

    it('should use correct prompt section for generate-architecture task type', () => {
      const params = { ...baseParams, planningTask: 'generate-architecture' as const };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('Generate Architecture Document');
      expect(prompt).toContain('Data Model');
    });

    it('should include template type context when available', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('saas-starter');
    });

    it('should handle null template type gracefully', () => {
      const params = { ...baseParams, templateType: null };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('No specific template selected');
    });

    it('should handle null previous planner output gracefully', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('No previous planner output available');
    });

    it('should handle no existing epics gracefully', () => {
      const params = { ...baseParams, existingEpics: [], existingStories: [] };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('None (this is a new project)');
    });

    it('should not contain any remaining template placeholders', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('should handle null epicId by defaulting to "new"', () => {
      const params = { ...baseParams, epicId: null };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('plan(devos-new)');
    });

    it('should include code style preferences', () => {
      const prompt = buildPlannerPipelinePrompt(baseParams);
      expect(prompt).toContain('ESLint + Prettier, 2-space indentation');
    });

    it('should use default code style when not provided', () => {
      const params = { ...baseParams, codeStylePreferences: '' };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('Follow existing project conventions');
    });

    it('should use default tech stack when not provided', () => {
      const params = { ...baseParams, techStack: '' };
      const prompt = buildPlannerPipelinePrompt(params);
      expect(prompt).toContain('Not specified');
    });
  });
});
