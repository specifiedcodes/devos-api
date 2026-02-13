import {
  QA_AGENT_SYSTEM_PROMPT,
  buildRunTestsPrompt,
  buildCodeReviewPrompt,
  buildSecurityAuditPrompt,
  buildCoverageAnalysisPrompt,
} from './qa-agent.prompts';
import { QAAgentTask } from '../interfaces/qa-agent.interfaces';

describe('QA Agent Prompts', () => {
  describe('QA_AGENT_SYSTEM_PROMPT', () => {
    it('should contain QA Agent identity', () => {
      expect(QA_AGENT_SYSTEM_PROMPT).toContain('QA Agent');
    });

    it('should mention quality standards and coverage threshold', () => {
      expect(QA_AGENT_SYSTEM_PROMPT).toContain('test coverage >= 80%');
    });

    it('should mention JSON output requirement', () => {
      expect(QA_AGENT_SYSTEM_PROMPT).toContain('valid JSON');
    });

    it('should mention not including markdown code fences', () => {
      expect(QA_AGENT_SYSTEM_PROMPT).toContain('Do NOT include markdown code fences');
    });

    it('should mention security checks', () => {
      expect(QA_AGENT_SYSTEM_PROMPT).toContain('hardcoded secrets');
      expect(QA_AGENT_SYSTEM_PROMPT).toContain('OWASP');
    });

    it('should mention severity categorization', () => {
      expect(QA_AGENT_SYSTEM_PROMPT).toContain('critical, high, medium, low, info');
    });

    it('should mention acceptance criteria validation', () => {
      expect(QA_AGENT_SYSTEM_PROMPT).toContain('acceptance criteria');
    });
  });

  describe('buildRunTestsPrompt', () => {
    it('should include file list in prompt', () => {
      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests for auth module',
        files: ['src/auth/auth.service.ts', 'src/auth/auth.controller.ts'],
      };

      const prompt = buildRunTestsPrompt(task);

      expect(prompt).toContain('src/auth/auth.service.ts');
      expect(prompt).toContain('src/auth/auth.controller.ts');
    });

    it('should include acceptance criteria in prompt', () => {
      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
        acceptanceCriteria: ['Users can register', 'Users can login'],
      };

      const prompt = buildRunTestsPrompt(task);

      expect(prompt).toContain('Users can register');
      expect(prompt).toContain('Users can login');
    });

    it('should include story ID in prompt', () => {
      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
        storyId: 'story-5-5',
      };

      const prompt = buildRunTestsPrompt(task);

      expect(prompt).toContain('story-5-5');
    });

    it('should include JSON schema instructions', () => {
      const task: QAAgentTask = {
        type: 'run-tests',
        description: 'Run tests',
      };

      const prompt = buildRunTestsPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });
  });

  describe('buildCodeReviewPrompt', () => {
    it('should include files and story context in prompt', () => {
      const task: QAAgentTask = {
        type: 'code-review',
        description: 'Review QA agent code',
        files: ['src/qa-agent.service.ts'],
        pullRequestId: 'PR-42',
      };

      const prompt = buildCodeReviewPrompt(task);

      expect(prompt).toContain('src/qa-agent.service.ts');
      expect(prompt).toContain('PR-42');
      expect(prompt).toContain('Review QA agent code');
    });

    it('should include acceptance criteria in prompt', () => {
      const task: QAAgentTask = {
        type: 'code-review',
        description: 'Review code',
        acceptanceCriteria: ['All tests pass', 'No security issues'],
      };

      const prompt = buildCodeReviewPrompt(task);

      expect(prompt).toContain('All tests pass');
      expect(prompt).toContain('No security issues');
    });

    it('should include JSON schema instructions', () => {
      const task: QAAgentTask = {
        type: 'code-review',
        description: 'Review code',
      };

      const prompt = buildCodeReviewPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });
  });

  describe('buildSecurityAuditPrompt', () => {
    it('should include codebase context in prompt', () => {
      const task: QAAgentTask = {
        type: 'security-audit',
        description: 'Audit for vulnerabilities',
        codebase: 'NestJS backend with PostgreSQL',
      };

      const prompt = buildSecurityAuditPrompt(task);

      expect(prompt).toContain('NestJS backend with PostgreSQL');
    });

    it('should include files in prompt', () => {
      const task: QAAgentTask = {
        type: 'security-audit',
        description: 'Audit code',
        files: ['src/auth.ts', 'src/db.ts'],
      };

      const prompt = buildSecurityAuditPrompt(task);

      expect(prompt).toContain('src/auth.ts');
      expect(prompt).toContain('src/db.ts');
    });

    it('should include JSON schema instructions', () => {
      const task: QAAgentTask = {
        type: 'security-audit',
        description: 'Audit',
      };

      const prompt = buildSecurityAuditPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });

    it('should mention security-specific concerns', () => {
      const task: QAAgentTask = {
        type: 'security-audit',
        description: 'Audit',
      };

      const prompt = buildSecurityAuditPrompt(task);

      expect(prompt).toContain('hardcoded secrets');
      expect(prompt).toContain('injection');
    });
  });

  describe('buildCoverageAnalysisPrompt', () => {
    it('should include files in prompt', () => {
      const task: QAAgentTask = {
        type: 'coverage-analysis',
        description: 'Analyze coverage',
        files: ['src/agents/qa-agent.service.ts', 'src/agents/qa-agent.service.spec.ts'],
      };

      const prompt = buildCoverageAnalysisPrompt(task);

      expect(prompt).toContain('src/agents/qa-agent.service.ts');
      expect(prompt).toContain('src/agents/qa-agent.service.spec.ts');
    });

    it('should include description in prompt', () => {
      const task: QAAgentTask = {
        type: 'coverage-analysis',
        description: 'Analyze test coverage for auth module',
      };

      const prompt = buildCoverageAnalysisPrompt(task);

      expect(prompt).toContain('Analyze test coverage for auth module');
    });

    it('should include JSON schema instructions', () => {
      const task: QAAgentTask = {
        type: 'coverage-analysis',
        description: 'Analyze',
      };

      const prompt = buildCoverageAnalysisPrompt(task);

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('Return ONLY the JSON object');
    });

    it('should mention coverage threshold', () => {
      const task: QAAgentTask = {
        type: 'coverage-analysis',
        description: 'Analyze',
      };

      const prompt = buildCoverageAnalysisPrompt(task);

      expect(prompt).toContain('80%');
    });
  });

  describe('All prompts include JSON schema instructions', () => {
    const baseTask: QAAgentTask = {
      type: 'run-tests',
      description: 'Test task',
    };

    it('buildRunTestsPrompt includes JSON schema', () => {
      const prompt = buildRunTestsPrompt(baseTask);
      expect(prompt).toContain('JSON object');
    });

    it('buildCodeReviewPrompt includes JSON schema', () => {
      const prompt = buildCodeReviewPrompt({ ...baseTask, type: 'code-review' });
      expect(prompt).toContain('JSON object');
    });

    it('buildSecurityAuditPrompt includes JSON schema', () => {
      const prompt = buildSecurityAuditPrompt({ ...baseTask, type: 'security-audit' });
      expect(prompt).toContain('JSON object');
    });

    it('buildCoverageAnalysisPrompt includes JSON schema', () => {
      const prompt = buildCoverageAnalysisPrompt({ ...baseTask, type: 'coverage-analysis' });
      expect(prompt).toContain('JSON object');
    });
  });
});
