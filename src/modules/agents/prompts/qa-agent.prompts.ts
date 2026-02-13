/**
 * QA Agent Prompt Templates
 * Story 5.5: QA Agent Implementation
 *
 * Structured prompts for each QA agent task type.
 * All prompts instruct Claude to return JSON-structured responses.
 */

import { QAAgentTask } from '../interfaces/qa-agent.interfaces';

/**
 * Shared system prompt for all QA Agent task types
 */
export const QA_AGENT_SYSTEM_PROMPT = `You are a QA Agent - an autonomous AI quality assurance engineer.
You ensure code quality, security, and test coverage for software projects.

Your capabilities:
- Run test analysis and identify test failures
- Perform comprehensive code reviews with actionable feedback
- Conduct security audits for vulnerabilities and hardcoded secrets
- Analyze test coverage gaps and recommend additional tests

Rules:
- Apply strict quality standards (test coverage >= 80%)
- Identify real issues, not cosmetic preferences
- Categorize issues by severity (critical, high, medium, low, info)
- Provide specific, actionable remediation for every issue found
- Check for hardcoded secrets, SQL injection, XSS, and common OWASP vulnerabilities
- Validate that acceptance criteria are fully met
- Return your response as valid JSON matching the required schema
- Do NOT include markdown code fences or any text outside the JSON object`;

/**
 * Build user prompt for run-tests task
 */
export function buildRunTestsPrompt(task: QAAgentTask): string {
  const filesSection = task.files?.length
    ? `\nTarget files:\n${task.files.map((f) => `- ${f}`).join('\n')}`
    : '';

  const acceptanceCriteriaSection = task.acceptanceCriteria?.length
    ? `\nAcceptance Criteria:\n${task.acceptanceCriteria.map((ac) => `- ${ac}`).join('\n')}`
    : '';

  const sections = [
    `Story ID: ${task.storyId || 'N/A'}`,
    `Description: ${task.description}`,
    filesSection,
    acceptanceCriteriaSection,
  ].filter(Boolean).join('\n');

  return `Analyze the following code for test coverage and generate a test analysis report. Return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "testResults": [
    {
      "file": "path/to/file.ts",
      "testName": "should do something",
      "status": "pass|fail|skip",
      "message": "Test result message"
    }
  ],
  "passed": 5,
  "failed": 1,
  "skipped": 0,
  "coverageEstimate": 85,
  "recommendations": ["list of recommendations"],
  "summary": "Human-readable summary of test analysis"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for code-review task
 */
export function buildCodeReviewPrompt(task: QAAgentTask): string {
  const filesSection = task.files?.length
    ? `\nFiles to review:\n${task.files.map((f) => `- ${f}`).join('\n')}`
    : '';

  const acceptanceCriteriaSection = task.acceptanceCriteria?.length
    ? `\nAcceptance Criteria:\n${task.acceptanceCriteria.map((ac) => `- ${ac}`).join('\n')}`
    : '';

  const sections = [
    `Pull Request ID: ${task.pullRequestId || 'N/A'}`,
    `Description: ${task.description}`,
    filesSection,
    acceptanceCriteriaSection,
  ].filter(Boolean).join('\n');

  return `Perform a comprehensive code review on the following files. Evaluate logic correctness, coding style, best practices, potential bugs, security issues, and performance concerns. Return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "issues": [
    {
      "file": "path/to/file.ts",
      "line": 10,
      "severity": "critical|high|medium|low|info",
      "category": "bug|security|performance|style|maintainability",
      "description": "Description of the issue",
      "suggestion": "How to fix the issue"
    }
  ],
  "approved": true,
  "decision": "PASS|FAIL|NEEDS_INFO",
  "summary": "Human-readable summary of the code review"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for security-audit task
 */
export function buildSecurityAuditPrompt(task: QAAgentTask): string {
  const filesSection = task.files?.length
    ? `\nFiles to audit:\n${task.files.map((f) => `- ${f}`).join('\n')}`
    : '';

  const codebaseSection = task.codebase
    ? `\nCodebase context:\n${task.codebase}`
    : '';

  const sections = [
    `Description: ${task.description}`,
    filesSection,
    codebaseSection,
  ].filter(Boolean).join('\n');

  return `Conduct a security audit on the following codebase. Check for hardcoded secrets, injection vulnerabilities, authentication flaws, dependency issues, and common OWASP vulnerabilities. Return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "vulnerabilities": [
    {
      "file": "path/to/file.ts",
      "line": 10,
      "severity": "critical|high|medium|low",
      "type": "Vulnerability type (e.g., SQL Injection, XSS, Hardcoded Secret)",
      "description": "Description of the vulnerability",
      "remediation": "How to fix the vulnerability"
    }
  ],
  "hardcodedSecrets": false,
  "dependencyIssues": ["list of dependency issues"],
  "overallRisk": "critical|high|medium|low",
  "recommendations": ["list of security recommendations"],
  "summary": "Human-readable summary of the security audit"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for coverage-analysis task
 */
export function buildCoverageAnalysisPrompt(task: QAAgentTask): string {
  const filesSection = task.files?.length
    ? `\nFiles to analyze:\n${task.files.map((f) => `- ${f}`).join('\n')}`
    : '';

  const sections = [
    `Description: ${task.description}`,
    filesSection,
  ].filter(Boolean).join('\n');

  return `Analyze test coverage for the following files. Identify untested code paths, suggest additional tests, and evaluate whether coverage meets the 80% threshold. Return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "coverageGaps": [
    {
      "file": "path/to/file.ts",
      "untestedPaths": ["list of untested code paths"],
      "suggestedTests": ["list of suggested test descriptions"],
      "priority": "high|medium|low"
    }
  ],
  "overallCoverage": 75,
  "meetsCoverageThreshold": false,
  "additionalTestsNeeded": 5,
  "summary": "Human-readable summary of coverage analysis"
}

Return ONLY the JSON object, no markdown or additional text.`;
}
