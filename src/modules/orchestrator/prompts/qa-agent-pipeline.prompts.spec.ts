/**
 * QA Agent Pipeline Prompt Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * Tests for the QA-specific pipeline prompt template and builder function.
 */

import { buildQAPipelinePrompt, QA_AGENT_PIPELINE_PROMPT_TEMPLATE } from './qa-agent-pipeline.prompts';
import { QAAgentExecutionParams } from '../interfaces/qa-agent-execution.interfaces';

describe('QA Agent Pipeline Prompts', () => {
  const baseParams: QAAgentExecutionParams = {
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    storyId: '11-5',
    storyTitle: 'QA Agent CLI Integration',
    storyDescription: 'Implement QA agent CLI integration for automated testing',
    acceptanceCriteria: [
      'Tests run successfully with coverage >= 80%',
      'Lint checks pass with zero errors',
      'Security scan finds no critical vulnerabilities',
    ],
    techStack: 'NestJS, TypeScript, Jest',
    testingStrategy: 'TDD with Jest',
    workspacePath: '/tmp/workspaces/ws-123/proj-456',
    gitRepoUrl: 'https://github.com/owner/repo.git',
    githubToken: 'ghp_test_token',
    repoOwner: 'owner',
    repoName: 'repo',
    prUrl: 'https://github.com/owner/repo/pull/42',
    prNumber: 42,
    devBranch: 'devos/dev/11-5',
    devTestResults: {
      total: 50,
      passed: 48,
      failed: 2,
      coverage: 85,
      testCommand: 'npm test',
    },
  };

  describe('QA_AGENT_PIPELINE_PROMPT_TEMPLATE', () => {
    it('should be a non-empty string template', () => {
      expect(QA_AGENT_PIPELINE_PROMPT_TEMPLATE).toBeDefined();
      expect(typeof QA_AGENT_PIPELINE_PROMPT_TEMPLATE).toBe('string');
      expect(QA_AGENT_PIPELINE_PROMPT_TEMPLATE.length).toBeGreaterThan(100);
    });

    it('should contain template placeholders', () => {
      expect(QA_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{storyTitle}}');
      expect(QA_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{storyDescription}}');
      expect(QA_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{acceptanceCriteria}}');
      expect(QA_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{storyId}}');
    });
  });

  describe('buildQAPipelinePrompt', () => {
    it('should include story title and description', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('QA Agent CLI Integration');
      expect(prompt).toContain('Implement QA agent CLI integration for automated testing');
    });

    it('should include numbered acceptance criteria checklist', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('1. Tests run successfully with coverage >= 80%');
      expect(prompt).toContain('2. Lint checks pass with zero errors');
      expect(prompt).toContain('3. Security scan finds no critical vulnerabilities');
    });

    it('should include test execution instructions', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('npm test');
      expect(prompt).toContain('--ci');
      expect(prompt).toContain('--coverage');
    });

    it('should include lint and type check commands', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('npm run lint');
      expect(prompt).toContain('npx tsc --noEmit');
    });

    it('should include security scan instructions', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('npm audit');
      expect(prompt).toMatch(/secret|hardcoded/i);
    });

    it('should include structured report output format', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('QA_REPORT_JSON');
    });

    it('should include Dev Agent baseline test results', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('50');  // total
      expect(prompt).toContain('48');  // passed
      expect(prompt).toContain('85');  // coverage
    });

    it('should handle empty acceptance criteria gracefully', () => {
      const params = { ...baseParams, acceptanceCriteria: [] };
      const prompt = buildQAPipelinePrompt(params);

      expect(prompt).toContain('No acceptance criteria specified');
      expect(prompt).not.toContain('undefined');
    });

    it('should include instruction NOT to push to remote', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toMatch(/NOT.*push|Do NOT push|do not push/i);
    });

    it('should include tech stack information', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('NestJS, TypeScript, Jest');
    });

    it('should include testing strategy', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('TDD with Jest');
    });

    it('should include the story ID', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('11-5');
    });

    it('should handle null dev test results gracefully', () => {
      const params = { ...baseParams, devTestResults: null };
      const prompt = buildQAPipelinePrompt(params);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('No baseline test results');
    });

    it('should include coverage threshold requirement', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('80%');
    });

    it('should include instruction to commit test files with proper format', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).toContain('test(devos-');
    });

    it('should not contain unresolved template placeholders', () => {
      const prompt = buildQAPipelinePrompt(baseParams);

      expect(prompt).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
    });
  });
});
