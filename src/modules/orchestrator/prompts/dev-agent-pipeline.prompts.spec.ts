/**
 * Dev Agent Pipeline Prompt Tests
 * Story 11.4: Dev Agent CLI Integration
 *
 * Tests for buildDevPipelinePrompt function and template structure.
 */

import {
  buildDevPipelinePrompt,
  DEV_AGENT_PIPELINE_PROMPT_TEMPLATE,
} from './dev-agent-pipeline.prompts';
import { DevAgentExecutionParams } from '../interfaces/dev-agent-execution.interfaces';

describe('DevAgentPipelinePrompts', () => {
  const baseParams: DevAgentExecutionParams = {
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    storyId: '11-4',
    storyTitle: 'Dev Agent CLI Integration',
    storyDescription:
      'Implement the dev agent CLI integration for real code execution',
    acceptanceCriteria: [
      'CLI spawns correctly with task prompt',
      'Tests run and pass',
      'Code is committed with descriptive messages',
    ],
    techStack: 'NestJS, TypeScript, PostgreSQL',
    codeStylePreferences: 'ESLint + Prettier, 2-space indentation',
    testingStrategy: 'TDD with Jest, coverage >= 80%',
    workspacePath: '/tmp/workspaces/ws-123/proj-456',
    gitRepoUrl: 'https://github.com/owner/repo.git',
    githubToken: 'ghp_test_token',
    repoOwner: 'owner',
    repoName: 'repo',
  };

  describe('DEV_AGENT_PIPELINE_PROMPT_TEMPLATE', () => {
    it('should contain all required placeholders', () => {
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{storyTitle}}');
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        '{{storyDescription}}',
      );
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        '{{acceptanceCriteria}}',
      );
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{techStack}}');
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        '{{codeStylePreferences}}',
      );
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        '{{testingStrategy}}',
      );
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{storyId}}');
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        '{{projectContext}}',
      );
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        '{{existingFiles}}',
      );
    });

    it('should include TDD instructions', () => {
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        'Test-Driven Development',
      );
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        'Write failing tests FIRST',
      );
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        'coverage >= 80%',
      );
    });

    it('should include commit message format with story ID placeholder', () => {
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        'feat(devos-{{storyId}})',
      );
    });

    it('should include test execution instructions', () => {
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('npm test');
    });

    it('should include security instructions', () => {
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        'hardcoded secrets',
      );
      expect(DEV_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain(
        'Do NOT commit .env files',
      );
    });
  });

  describe('buildDevPipelinePrompt', () => {
    it('should include story title and description', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).toContain('Dev Agent CLI Integration');
      expect(prompt).toContain(
        'Implement the dev agent CLI integration for real code execution',
      );
    });

    it('should include numbered acceptance criteria', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).toContain(
        '1. CLI spawns correctly with task prompt',
      );
      expect(prompt).toContain('2. Tests run and pass');
      expect(prompt).toContain(
        '3. Code is committed with descriptive messages',
      );
    });

    it('should include TDD instructions', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).toContain('Test-Driven Development');
      expect(prompt).toContain('Write failing tests FIRST');
    });

    it('should include test coverage requirement (>= 80%)', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).toContain('coverage >= 80%');
    });

    it('should include commit message format with story ID', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).toContain('feat(devos-11-4)');
    });

    it('should include project context from workspace', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).toContain('NestJS, TypeScript, PostgreSQL');
      expect(prompt).toContain('ESLint + Prettier');
    });

    it('should include existing files section', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).toContain('Existing Project Files');
    });

    it('should handle empty acceptance criteria gracefully', () => {
      const params = {
        ...baseParams,
        acceptanceCriteria: [],
      };
      const prompt = buildDevPipelinePrompt(params);
      expect(prompt).toContain('No acceptance criteria specified');
    });

    it('should handle missing project context gracefully', () => {
      const params = {
        ...baseParams,
        techStack: '',
        codeStylePreferences: '',
      };
      const prompt = buildDevPipelinePrompt(params);
      expect(prompt).toContain('No project context available');
    });

    it('should not duplicate tech stack in project context', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      // Tech stack should appear in the Tech Stack section but not be repeated in Project Context
      const techStackOccurrences = prompt.split('NestJS, TypeScript, PostgreSQL').length - 1;
      expect(techStackOccurrences).toBe(1);
    });

    it('should not contain any remaining template placeholders', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('should include tech stack information', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).toContain('NestJS, TypeScript, PostgreSQL');
    });

    it('should include testing strategy', () => {
      const prompt = buildDevPipelinePrompt(baseParams);
      expect(prompt).toContain('TDD with Jest, coverage >= 80%');
    });

    it('should use default testing strategy when not provided', () => {
      const params = {
        ...baseParams,
        testingStrategy: '',
      };
      const prompt = buildDevPipelinePrompt(params);
      expect(prompt).toContain('TDD with Jest/Vitest');
    });

    it('should use default code style when not provided', () => {
      const params = {
        ...baseParams,
        codeStylePreferences: '',
      };
      const prompt = buildDevPipelinePrompt(params);
      expect(prompt).toContain('Follow existing project conventions');
    });
  });
});
