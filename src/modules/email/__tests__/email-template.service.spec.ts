/**
 * EmailTemplateService Tests
 * Story 16.6: Production Email Service (AC5)
 */

import { EmailTemplateService, EmailTemplate } from '../services/email-template.service';

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(() => {
    service = new EmailTemplateService();
  });

  describe('render()', () => {
    it('should return { subject, html, text } for each template', () => {
      const templates = Object.values(EmailTemplate);
      for (const template of templates) {
        const result = service.render(template, { workspaceName: 'Test', userName: 'John' });
        expect(result).toHaveProperty('subject');
        expect(result).toHaveProperty('html');
        expect(result).toHaveProperty('text');
        expect(typeof result.subject).toBe('string');
        expect(typeof result.html).toBe('string');
        expect(typeof result.text).toBe('string');
        expect(result.subject.length).toBeGreaterThan(0);
        expect(result.html.length).toBeGreaterThan(0);
        expect(result.text.length).toBeGreaterThan(0);
      }
    });

    it('should throw for unknown template', () => {
      expect(() => service.render('unknown-template' as any, {})).toThrow('Unknown email template');
    });
  });

  describe('welcome template', () => {
    it('should include correct subject line', () => {
      const result = service.render(EmailTemplate.WELCOME, { userName: 'John' });
      expect(result.subject).toBe('Welcome to DevOS!');
    });

    it('should include user name in HTML', () => {
      const result = service.render(EmailTemplate.WELCOME, { userName: 'John' });
      expect(result.html).toContain('John');
    });

    it('should include dashboard URL in HTML', () => {
      const result = service.render(EmailTemplate.WELCOME, { dashboardUrl: 'https://devos.app/dashboard' });
      expect(result.html).toContain('https://devos.app/dashboard');
    });
  });

  describe('password-reset template', () => {
    it('should include correct subject', () => {
      const result = service.render(EmailTemplate.PASSWORD_RESET, { resetUrl: 'https://devos.app/reset' });
      expect(result.subject).toBe('Reset your password');
    });

    it('should include expiry warning', () => {
      const result = service.render(EmailTemplate.PASSWORD_RESET, { resetUrl: '#' });
      expect(result.html).toContain('1 hour');
    });

    it('should include warning about not requesting', () => {
      const result = service.render(EmailTemplate.PASSWORD_RESET, {});
      expect(result.html).toContain('Didn');
    });
  });

  describe('2fa-backup-codes template', () => {
    it('should format codes in monospace', () => {
      const result = service.render(EmailTemplate.TWO_FA_BACKUP_CODES, {
        codes: ['ABC123', 'DEF456', 'GHI789'],
      });
      expect(result.html).toContain('code-block');
      expect(result.html).toContain('ABC123');
      expect(result.html).toContain('DEF456');
    });

    it('should include codes in plain text', () => {
      const result = service.render(EmailTemplate.TWO_FA_BACKUP_CODES, {
        codes: ['ABC123', 'DEF456'],
      });
      expect(result.text).toContain('ABC123');
      expect(result.text).toContain('DEF456');
    });
  });

  describe('workspace-invitation template', () => {
    it('should include workspace name in subject', () => {
      const result = service.render(EmailTemplate.WORKSPACE_INVITATION, {
        workspaceName: 'Acme Corp',
        inviterName: 'Jane',
        inviteUrl: '#',
      });
      expect(result.subject).toContain('Acme Corp');
    });

    it('should include inviter name in HTML', () => {
      const result = service.render(EmailTemplate.WORKSPACE_INVITATION, {
        workspaceName: 'Acme',
        inviterName: 'Jane Doe',
      });
      expect(result.html).toContain('Jane Doe');
    });
  });

  describe('cost-alert template', () => {
    it('should include threshold in subject', () => {
      const result = service.render(EmailTemplate.COST_ALERT, {
        workspaceName: 'Acme',
        threshold: 80,
        currentSpend: '80.00',
        limit: '100.00',
      });
      expect(result.subject).toContain('80%');
    });

    it('should use correct color coding for warning', () => {
      const result = service.render(EmailTemplate.COST_ALERT, {
        threshold: 80,
        critical: false,
      });
      expect(result.html).toContain('alert-box-warning');
    });

    it('should use correct color coding for critical', () => {
      const result = service.render(EmailTemplate.COST_ALERT, {
        threshold: 100,
        critical: true,
      });
      expect(result.html).toContain('alert-box-critical');
    });
  });

  describe('agent-error template', () => {
    it('should include agent name in subject', () => {
      const result = service.render(EmailTemplate.AGENT_ERROR, {
        agentName: 'Dev Agent',
        errorMessage: 'Out of memory',
      });
      expect(result.subject).toContain('Dev Agent');
    });

    it('should include error message in HTML', () => {
      const result = service.render(EmailTemplate.AGENT_ERROR, {
        agentName: 'Bot',
        errorMessage: 'Connection timeout',
      });
      expect(result.html).toContain('Connection timeout');
    });
  });

  describe('weekly-summary template', () => {
    it('should include workspace name in subject', () => {
      const result = service.render(EmailTemplate.WEEKLY_SUMMARY, {
        workspaceName: 'Acme Corp',
      });
      expect(result.subject).toContain('Acme Corp');
    });
  });

  describe('account-deletion template', () => {
    it('should include 30-day recovery info', () => {
      const result = service.render(EmailTemplate.ACCOUNT_DELETION, {});
      expect(result.html).toContain('30');
      expect(result.text).toContain('30');
    });
  });

  describe('notification event templates', () => {
    it('should render story-completed template', () => {
      const result = service.render(EmailTemplate.STORY_COMPLETED, {
        storyTitle: 'Implement login',
        storyKey: 'DEV-42',
      });
      expect(result.subject).toContain('Implement login');
      expect(result.html).toContain('DEV-42');
    });

    it('should render epic-completed template', () => {
      const result = service.render(EmailTemplate.EPIC_COMPLETED, {
        epicTitle: 'Auth System',
        storyCount: 5,
      });
      expect(result.subject).toContain('Auth System');
      expect(result.html).toContain('5');
    });

    it('should render deployment-success template', () => {
      const result = service.render(EmailTemplate.DEPLOYMENT_SUCCESS, {
        projectName: 'MyApp',
        environment: 'production',
      });
      expect(result.subject).toContain('MyApp');
      expect(result.html).toContain('production');
    });

    it('should render deployment-failed template', () => {
      const result = service.render(EmailTemplate.DEPLOYMENT_FAILED, {
        projectName: 'MyApp',
        errorSummary: 'Build failed',
      });
      expect(result.subject).toContain('MyApp');
      expect(result.html).toContain('Build failed');
    });
  });

  describe('test-email template', () => {
    it('should render test email', () => {
      const result = service.render(EmailTemplate.TEST_EMAIL, {});
      expect(result.subject).toBe('DevOS Test Email');
      expect(result.html).toContain('test email');
    });
  });

  describe('HTML structure', () => {
    it('should include DevOS branding (header gradient)', () => {
      const result = service.render(EmailTemplate.WELCOME, {});
      expect(result.html).toContain('linear-gradient');
      expect(result.html).toContain('#667eea');
    });

    it('should include footer with unsubscribe link', () => {
      const result = service.render(EmailTemplate.WELCOME, {
        unsubscribeUrl: 'https://devos.app/unsubscribe',
      });
      expect(result.html).toContain('Unsubscribe');
      expect(result.html).toContain('https://devos.app/unsubscribe');
    });

    it('should include footer with email preferences link', () => {
      const result = service.render(EmailTemplate.WELCOME, {
        preferencesUrl: 'https://devos.app/preferences',
      });
      expect(result.html).toContain('Email Preferences');
      expect(result.html).toContain('https://devos.app/preferences');
    });

    it('should include DevOS platform name in footer', () => {
      const result = service.render(EmailTemplate.WELCOME, {});
      expect(result.html).toContain('DevOS - Autonomous Development Platform');
    });
  });

  describe('email header injection prevention', () => {
    it('should strip newlines from subject lines to prevent header injection', () => {
      const result = service.render(EmailTemplate.WORKSPACE_INVITATION, {
        workspaceName: 'Evil\r\nBcc: attacker@evil.com\r\nSubject: Fake',
        inviterName: 'Test',
      });
      expect(result.subject).not.toContain('\r');
      expect(result.subject).not.toContain('\n');
    });
  });

  describe('XSS prevention', () => {
    it('should HTML-escape user-provided data in workspace name', () => {
      const result = service.render(EmailTemplate.WORKSPACE_INVITATION, {
        workspaceName: '<script>alert("xss")</script>',
        inviterName: 'Test',
      });
      expect(result.html).not.toContain('<script>alert("xss")</script>');
      expect(result.html).toContain('&lt;script&gt;');
    });

    it('should HTML-escape user-provided data in agent name', () => {
      const result = service.render(EmailTemplate.AGENT_ERROR, {
        agentName: '<img onerror="alert(1)">',
        errorMessage: 'test',
      });
      expect(result.html).not.toContain('<img onerror');
      expect(result.html).toContain('&lt;img');
    });
  });

  describe('missing optional data', () => {
    it('should handle missing userName gracefully', () => {
      expect(() => service.render(EmailTemplate.WELCOME, {})).not.toThrow();
    });

    it('should handle missing codes gracefully', () => {
      expect(() => service.render(EmailTemplate.TWO_FA_BACKUP_CODES, {})).not.toThrow();
    });

    it('should handle empty data object', () => {
      const templates = Object.values(EmailTemplate);
      for (const template of templates) {
        expect(() => service.render(template, {})).not.toThrow();
      }
    });
  });
});
