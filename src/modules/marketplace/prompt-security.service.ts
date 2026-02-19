/**
 * PromptSecurityService
 *
 * Story 18-5: Agent Marketplace Backend
 *
 * Analyzes agent prompts for potential security issues like
 * prompt injection, malicious instructions, and suspicious patterns.
 */
import { Injectable, Logger } from '@nestjs/common';

export interface SecurityFinding {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  pattern?: string;
}

export interface SecurityAnalysisResult {
  isSafe: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  findings: SecurityFinding[];
}

@Injectable()
export class PromptSecurityService {
  private readonly logger = new Logger(PromptSecurityService.name);

  // Patterns that might indicate malicious prompts
  private readonly suspiciousPatterns = [
    { pattern: /ignore (all )?(previous|above) instructions/i, type: 'instruction_override' },
    { pattern: /disregard (all )?(previous|above) instructions/i, type: 'instruction_override' },
    { pattern: /forget (all )?(previous|above) instructions/i, type: 'instruction_override' },
    { pattern: /you are now (a |an )?(different|new|malicious|admin|root|superuser)/i, type: 'role_switch' },
    { pattern: /output (your |the )?(system|api|secret) (prompt|instructions)/i, type: 'system_extraction' },
    { pattern: /jailbreak/i, type: 'jailbreak' },
    { pattern: /dan mode/i, type: 'jailbreak' },
    { pattern: /do anything now/i, type: 'jailbreak' },
    { pattern: /bypass (all )?(restrictions|filters|safety)/i, type: 'restriction_bypass' },
    { pattern: /act as if you are (not|free from)/i, type: 'restriction_bypass' },
    { pattern: /developer mode/i, type: 'jailbreak' },
    { pattern: /sudo mode/i, type: 'jailbreak' },
    { pattern: /override (all )?(rules|guidelines|policies)/i, type: 'restriction_bypass' },
  ];

  // Patterns for potentially dangerous tool combinations
  private readonly dangerousToolCombinations = [
    ['file_write', 'shell_exec'],
    ['database_write', 'shell_exec'],
    ['file_delete', 'file_write'],
    ['api_key', 'http_request'],
  ];

  /**
   * Analyze a prompt for potential security issues.
   * Returns a security report with risk level and findings.
   */
  async analyzePrompt(systemPrompt: string): Promise<SecurityAnalysisResult> {
    const findings: SecurityFinding[] = [];

    // Check for suspicious patterns
    for (const { pattern, type } of this.suspiciousPatterns) {
      const match = systemPrompt.match(pattern);
      if (match) {
        findings.push({
          type: 'suspicious_pattern',
          severity: 'high',
          message: `Potential prompt injection pattern detected: "${match[0]}"`,
          pattern: type,
        });
      }
    }

    // Check for excessive length (could be hiding malicious content)
    if (systemPrompt.length > 50000) {
      findings.push({
        type: 'excessive_length',
        severity: 'medium',
        message: 'Prompt exceeds 50,000 characters, which could indicate hidden malicious content',
      });
    }

    // Check for encoded content that might hide malicious instructions
    const encodedPatterns = [
      { pattern: /base64/i, type: 'base64' },
      { pattern: /atob\s*\(/i, type: 'base64' },
      { pattern: /\\x[0-9a-f]{2}/i, type: 'hex_encoding' },
      { pattern: /&#x?[0-9a-f]+;/i, type: 'html_entity' },
    ];

    for (const { pattern, type } of encodedPatterns) {
      if (pattern.test(systemPrompt)) {
        findings.push({
          type: 'encoded_content',
          severity: 'medium',
          message: `Potential encoded content detected (${type}), which could hide malicious instructions`,
          pattern: type,
        });
      }
    }

    // Check for system role manipulation
    if (/you (are|will be|become)\s+(now|a|an)\s+(admin|root|superuser|developer)/i.test(systemPrompt)) {
      findings.push({
        type: 'privilege_escalation',
        severity: 'high',
        message: 'Potential privilege escalation attempt detected',
      });
    }

    // Check for data exfiltration patterns
    if (/send\s+(\w+\s+)?(to|via|through)\s+(email|http|webhook|api)/i.test(systemPrompt)) {
      findings.push({
        type: 'potential_exfiltration',
        severity: 'medium',
        message: 'Potential data exfiltration pattern detected',
      });
    }

    const riskLevel = this.calculateRiskLevel(findings);

    if (riskLevel === 'high') {
      this.logger.warn(`High-risk prompt detected with ${findings.length} findings`);
    }

    return {
      isSafe: riskLevel !== 'high',
      riskLevel,
      findings,
    };
  }

  /**
   * Analyze a complete agent definition for security issues.
   */
  async analyzeAgentDefinition(definition: {
    system_prompt?: string;
    tools?: { allowed?: string[]; denied?: string[] };
  }): Promise<SecurityAnalysisResult> {
    const findings: SecurityFinding[] = [];

    // Analyze the system prompt
    if (definition.system_prompt) {
      const promptResult = await this.analyzePrompt(definition.system_prompt);
      findings.push(...promptResult.findings);
    }

    // Check for dangerous tool combinations
    if (definition.tools?.allowed && definition.tools.allowed.length > 0) {
      const toolFindings = this.checkToolCombinations(definition.tools.allowed);
      findings.push(...toolFindings);
    }

    const riskLevel = this.calculateRiskLevel(findings);

    return {
      isSafe: riskLevel !== 'high',
      riskLevel,
      findings,
    };
  }

  /**
   * Check for dangerous combinations of tools.
   */
  private checkToolCombinations(allowedTools: string[]): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const normalizedTools = allowedTools.map(t => t.toLowerCase().replace(/[-_]/g, ''));

    for (const combination of this.dangerousToolCombinations) {
      const normalized = combination.map(t => t.toLowerCase().replace(/[-_]/g, ''));
      if (normalized.every(tool => normalizedTools.some(t => t.includes(tool) || tool.includes(t)))) {
        findings.push({
          type: 'dangerous_tool_combination',
          severity: 'medium',
          message: `Potentially dangerous tool combination: ${combination.join(' + ')}`,
        });
      }
    }

    return findings;
  }

  /**
   * Calculate overall risk level from findings.
   */
  private calculateRiskLevel(findings: SecurityFinding[]): 'low' | 'medium' | 'high' {
    if (findings.some(f => f.severity === 'high')) return 'high';
    if (findings.some(f => f.severity === 'medium')) return 'medium';
    return 'low';
  }
}
