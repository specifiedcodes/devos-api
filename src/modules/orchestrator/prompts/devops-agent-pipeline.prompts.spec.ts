/**
 * DevOps Agent Pipeline Prompt Tests
 * Story 11.7: DevOps Agent CLI Integration
 *
 * Tests for buildDevOpsPipelinePrompt and DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE.
 */

import {
  buildDevOpsPipelinePrompt,
  DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE,
} from './devops-agent-pipeline.prompts';
import { DevOpsAgentExecutionParams } from '../interfaces/devops-agent-execution.interfaces';

describe('DevOps Agent Pipeline Prompts', () => {
  const baseParams: DevOpsAgentExecutionParams = {
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    storyId: 'story-789',
    storyTitle: 'Add user profile endpoint',
    storyDescription: 'Implement GET /api/users/:id endpoint for user profiles',
    workspacePath: '/tmp/workspace',
    gitRepoUrl: 'https://github.com/org/repo.git',
    githubToken: 'ghp_test',
    repoOwner: 'org',
    repoName: 'repo',
    prUrl: 'https://github.com/org/repo/pull/42',
    prNumber: 42,
    devBranch: 'devos/dev/story-789',
    qaVerdict: 'PASS',
    qaReportSummary: 'All tests passing, no issues found',
    deploymentPlatform: 'railway',
    supabaseConfigured: false,
    environment: 'staging',
  };

  describe('DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE', () => {
    it('should be a non-empty string', () => {
      expect(DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE).toBeDefined();
      expect(typeof DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE).toBe('string');
      expect(DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE.length).toBeGreaterThan(0);
    });

    it('should contain deployment URL placeholder', () => {
      expect(DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{deploymentUrl}}');
    });

    it('should contain environment placeholder', () => {
      expect(DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{environment}}');
    });

    it('should contain story title placeholder', () => {
      expect(DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE).toContain('{{storyTitle}}');
    });
  });

  describe('buildDevOpsPipelinePrompt', () => {
    it('should include deployment URL', () => {
      const prompt = buildDevOpsPipelinePrompt(baseParams, 'https://app.railway.app');

      expect(prompt).toContain('https://app.railway.app');
      expect(prompt).not.toContain('{{deploymentUrl}}');
    });

    it('should include health check instructions', () => {
      const prompt = buildDevOpsPipelinePrompt(baseParams, 'https://app.railway.app');

      expect(prompt).toContain('/api/health');
      expect(prompt).toContain('/health');
      expect(prompt).toContain('curl');
    });

    it('should include API endpoint smoke test instructions', () => {
      const prompt = buildDevOpsPipelinePrompt(baseParams, 'https://app.railway.app');

      expect(prompt).toContain('API Endpoint Smoke Tests');
      expect(prompt).toContain('GET endpoints');
      expect(prompt).toContain('valid JSON');
    });

    it('should include structured report output format', () => {
      const prompt = buildDevOpsPipelinePrompt(baseParams, 'https://app.railway.app');

      expect(prompt).toContain('```json');
      expect(prompt).toContain('"healthCheck"');
      expect(prompt).toContain('"apiChecks"');
      expect(prompt).toContain('"passed"');
      expect(prompt).toContain('"responseTimeMs"');
    });

    it('should include environment context', () => {
      const prompt = buildDevOpsPipelinePrompt(baseParams, 'https://app.railway.app');

      expect(prompt).toContain('staging');
      expect(prompt).not.toContain('{{environment}}');
    });

    it('should include story context for relevant endpoint testing', () => {
      const prompt = buildDevOpsPipelinePrompt(baseParams, 'https://app.railway.app');

      expect(prompt).toContain('Add user profile endpoint');
      expect(prompt).toContain('Implement GET /api/users/:id endpoint');
      expect(prompt).not.toContain('{{storyTitle}}');
      expect(prompt).not.toContain('{{storyDescription}}');
    });

    it('should include 5-minute timeout instruction', () => {
      const prompt = buildDevOpsPipelinePrompt(baseParams, 'https://app.railway.app');

      expect(prompt).toContain('5-minute timeout');
      expect(prompt).toContain('5 minutes');
    });

    it('should handle empty deployment URL gracefully', () => {
      const prompt = buildDevOpsPipelinePrompt(baseParams, '');

      expect(prompt).toContain('http://localhost:3000');
      expect(prompt).not.toContain('{{deploymentUrl}}');
    });

    it('should handle missing environment by defaulting to staging', () => {
      const params = { ...baseParams, environment: '' };
      const prompt = buildDevOpsPipelinePrompt(params, 'https://app.railway.app');

      expect(prompt).toContain('staging');
    });

    it('should handle missing story title gracefully', () => {
      const params = { ...baseParams, storyTitle: '' };
      const prompt = buildDevOpsPipelinePrompt(params, 'https://app.railway.app');

      expect(prompt).toContain('Unknown Story');
    });

    it('should handle missing story description gracefully', () => {
      const params = { ...baseParams, storyDescription: '' };
      const prompt = buildDevOpsPipelinePrompt(params, 'https://app.railway.app');

      expect(prompt).toContain('No description provided');
    });

    it('should replace all template placeholders', () => {
      const prompt = buildDevOpsPipelinePrompt(baseParams, 'https://app.railway.app');

      expect(prompt).not.toMatch(/\{\{.*?\}\}/);
    });
  });
});
