/**
 * EmailTemplateService
 * Story 16.6: Production Email Service (AC5)
 *
 * HTML template rendering for all transactional and notification emails.
 * All templates share a common DevOS-branded layout with gradient header,
 * styled content area, and footer with unsubscribe/preferences links.
 */

import { Injectable } from '@nestjs/common';

export enum EmailTemplate {
  WELCOME = 'welcome',
  PASSWORD_RESET = 'password-reset',
  TWO_FA_BACKUP_CODES = '2fa-backup-codes',
  WORKSPACE_INVITATION = 'workspace-invitation',
  COST_ALERT = 'cost-alert',
  AGENT_ERROR = 'agent-error',
  WEEKLY_SUMMARY = 'weekly-summary',
  ACCOUNT_DELETION = 'account-deletion',
  // Notification event templates
  STORY_COMPLETED = 'story-completed',
  EPIC_COMPLETED = 'epic-completed',
  DEPLOYMENT_SUCCESS = 'deployment-success',
  DEPLOYMENT_FAILED = 'deployment-failed',
  // Test template
  TEST_EMAIL = 'test-email',
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailTemplateService {
  /**
   * Render an email template with data.
   * Returns { subject, html, text }
   */
  render(template: EmailTemplate, data: Record<string, any>): RenderedEmail {
    switch (template) {
      case EmailTemplate.WELCOME:
        return this.renderWelcome(data);
      case EmailTemplate.PASSWORD_RESET:
        return this.renderPasswordReset(data);
      case EmailTemplate.TWO_FA_BACKUP_CODES:
        return this.renderTwoFaBackupCodes(data);
      case EmailTemplate.WORKSPACE_INVITATION:
        return this.renderWorkspaceInvitation(data);
      case EmailTemplate.COST_ALERT:
        return this.renderCostAlert(data);
      case EmailTemplate.AGENT_ERROR:
        return this.renderAgentError(data);
      case EmailTemplate.WEEKLY_SUMMARY:
        return this.renderWeeklySummary(data);
      case EmailTemplate.ACCOUNT_DELETION:
        return this.renderAccountDeletion(data);
      case EmailTemplate.STORY_COMPLETED:
        return this.renderStoryCompleted(data);
      case EmailTemplate.EPIC_COMPLETED:
        return this.renderEpicCompleted(data);
      case EmailTemplate.DEPLOYMENT_SUCCESS:
        return this.renderDeploymentSuccess(data);
      case EmailTemplate.DEPLOYMENT_FAILED:
        return this.renderDeploymentFailed(data);
      case EmailTemplate.TEST_EMAIL:
        return this.renderTestEmail(data);
      default:
        throw new Error(`Unknown email template: ${template}`);
    }
  }

  /**
   * HTML-escape user-provided data to prevent XSS in email clients.
   */
  private escapeHtml(str: string): string {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Sanitize text for use in email subject lines.
   * Strips newlines and carriage returns to prevent email header injection.
   */
  private sanitizeSubject(str: string): string {
    if (!str) return '';
    return String(str).replace(/[\r\n]/g, ' ').trim();
  }

  /**
   * Wrap content in the shared DevOS email layout.
   */
  private wrapInLayout(headerContent: string, bodyContent: string, data: Record<string, any>): string {
    const unsubscribeUrl = this.escapeHtml(data.unsubscribeUrl || '#');
    const preferencesUrl = this.escapeHtml(data.preferencesUrl || '#');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; padding: 20px; }
    .footer a { color: #667eea; }
    .alert-box-warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .alert-box-critical { background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .alert-box-success { background: #d1fae5; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .alert-box-info { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }
    .code-block { background: #1f2937; color: #e5e7eb; font-family: 'Courier New', monospace; padding: 16px; border-radius: 6px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${headerContent}</div>
    <div class="content">${bodyContent}</div>
    <div class="footer">
      <p>DevOS - Autonomous Development Platform</p>
      <p><a href="${unsubscribeUrl}">Unsubscribe</a> | <a href="${preferencesUrl}">Email Preferences</a></p>
    </div>
  </div>
</body>
</html>`;
  }

  // ============================================================================
  // Template Renderers
  // ============================================================================

  private renderWelcome(data: Record<string, any>): RenderedEmail {
    const userName = this.escapeHtml(data.userName || 'there');
    const dashboardUrl = this.escapeHtml(data.dashboardUrl || '#');

    const subject = 'Welcome to DevOS!';
    const html = this.wrapInLayout(
      '<h1>Welcome to DevOS!</h1>',
      `<p>Hi ${userName},</p>
      <p>Welcome to DevOS - your autonomous development platform. We're excited to have you on board!</p>
      <h3>Getting Started</h3>
      <ul>
        <li>Create your first workspace</li>
        <li>Set up a project</li>
        <li>Launch your first AI agent</li>
      </ul>
      <a href="${dashboardUrl}" class="button">Go to Dashboard</a>`,
      data,
    );
    const text = `Welcome to DevOS!\n\nHi ${data.userName || 'there'},\n\nWelcome to DevOS - your autonomous development platform.\n\nGet started: ${data.dashboardUrl || ''}`;

    return { subject, html, text };
  }

  private renderPasswordReset(data: Record<string, any>): RenderedEmail {
    const resetUrl = this.escapeHtml(data.resetUrl || '#');

    const subject = 'Reset your password';
    const html = this.wrapInLayout(
      '<h1>Password Reset</h1>',
      `<p>You requested a password reset for your DevOS account.</p>
      <p>Click the button below to reset your password. This link will expire in <strong>1 hour</strong>.</p>
      <a href="${resetUrl}" class="button">Reset Password</a>
      <div class="alert-box-warning">
        <p><strong>Didn't request this?</strong> If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.</p>
      </div>`,
      data,
    );
    const text = `Reset your password\n\nYou requested a password reset. This link expires in 1 hour.\n\nReset: ${data.resetUrl || ''}\n\nIf you didn't request this, ignore this email.`;

    return { subject, html, text };
  }

  private renderTwoFaBackupCodes(data: Record<string, any>): RenderedEmail {
    const codes = (data.codes || []) as string[];
    const codesHtml = codes.map(c => `<code style="display:block;padding:4px 8px;margin:2px 0;">${this.escapeHtml(c)}</code>`).join('');

    const subject = 'Your 2FA Backup Codes';
    const html = this.wrapInLayout(
      '<h1>2FA Backup Codes</h1>',
      `<p>Here are your two-factor authentication backup codes. Store them in a safe place.</p>
      <div class="code-block">${codesHtml}</div>
      <div class="alert-box-warning">
        <p><strong>Important:</strong> Each code can only be used once. Store these codes securely - they are your backup for accessing your account if you lose your authenticator device.</p>
      </div>`,
      data,
    );
    const text = `Your 2FA Backup Codes\n\nStore these codes in a safe place:\n\n${codes.join('\n')}\n\nEach code can only be used once.`;

    return { subject, html, text };
  }

  private renderWorkspaceInvitation(data: Record<string, any>): RenderedEmail {
    const workspaceName = this.escapeHtml(data.workspaceName || 'a workspace');
    const inviterName = this.escapeHtml(data.inviterName || 'Someone');
    const inviteUrl = this.escapeHtml(data.inviteUrl || '#');
    const role = this.escapeHtml(data.role || 'member');

    const subject = `You've been invited to ${this.sanitizeSubject(data.workspaceName || 'a workspace')}`;
    const html = this.wrapInLayout(
      `<h1>Workspace Invitation</h1>`,
      `<p>${inviterName} has invited you to join <strong>${workspaceName}</strong> on DevOS.</p>
      <div class="alert-box-info">
        <p><strong>Role:</strong> ${role}</p>
        <p><strong>Workspace:</strong> ${workspaceName}</p>
      </div>
      <a href="${inviteUrl}" class="button">Accept Invitation</a>`,
      data,
    );
    const text = `You've been invited to ${data.workspaceName || 'a workspace'}\n\n${data.inviterName || 'Someone'} invited you as ${data.role || 'member'}.\n\nAccept: ${data.inviteUrl || ''}`;

    return { subject, html, text };
  }

  private renderCostAlert(data: Record<string, any>): RenderedEmail {
    const workspaceName = this.escapeHtml(data.workspaceName || 'Workspace');
    const threshold = data.threshold || 0;
    const currentSpend = this.escapeHtml(data.currentSpend || '0.00');
    const limit = this.escapeHtml(data.limit || '0.00');
    const percentageUsed = data.percentageUsed || 0;
    const critical = data.critical || threshold >= 100;
    const dashboardUrl = this.escapeHtml(data.dashboardUrl || '#');

    const alertClass = critical ? 'alert-box-critical' : 'alert-box-warning';

    const subject = `Spending Alert: ${threshold}% Budget Used - ${this.sanitizeSubject(data.workspaceName || 'Workspace')}`;
    const html = this.wrapInLayout(
      `<h1>${critical ? 'Budget Limit Reached' : 'Spending Alert'}</h1>`,
      `<p>Hi there,</p>
      <div class="${alertClass}">
        <h2 style="margin-top: 0;">${threshold}% Budget Used</h2>
        <p><strong>Workspace:</strong> ${workspaceName}</p>
        <p><strong>Current Spend:</strong> $${currentSpend}</p>
        <p><strong>Monthly Limit:</strong> $${limit}</p>
        <p><strong>Percentage Used:</strong> ${percentageUsed}%</p>
      </div>
      ${critical
        ? '<p><strong>New agent tasks are currently blocked.</strong> Increase your monthly budget in workspace settings to continue.</p>'
        : '<p>You\'re approaching your monthly AI spending budget. Consider increasing your limit.</p>'}
      <a href="${dashboardUrl}" class="button">View Usage Dashboard</a>`,
      data,
    );
    const text = `Spending Alert: ${threshold}% Budget Used\n\nWorkspace: ${data.workspaceName || ''}\nCurrent Spend: $${data.currentSpend || '0'}\nLimit: $${data.limit || '0'}\n\nDashboard: ${data.dashboardUrl || ''}`;

    return { subject, html, text };
  }

  private renderAgentError(data: Record<string, any>): RenderedEmail {
    const agentName = this.escapeHtml(data.agentName || 'Agent');
    const errorMessage = this.escapeHtml(data.errorMessage || 'Unknown error');
    const recoveryUrl = this.escapeHtml(data.recoveryUrl || '#');

    const subject = `Agent Error: ${this.sanitizeSubject(data.agentName || 'Agent')} needs attention`;
    const html = this.wrapInLayout(
      '<h1>Agent Error</h1>',
      `<p>An error occurred with agent <strong>${agentName}</strong> that requires your attention.</p>
      <div class="alert-box-critical">
        <h3 style="margin-top: 0;">Error Details</h3>
        <p>${errorMessage}</p>
      </div>
      <a href="${recoveryUrl}" class="button">View Agent</a>`,
      data,
    );
    const text = `Agent Error: ${data.agentName || 'Agent'} needs attention\n\nError: ${data.errorMessage || 'Unknown error'}\n\nView: ${data.recoveryUrl || ''}`;

    return { subject, html, text };
  }

  private renderWeeklySummary(data: Record<string, any>): RenderedEmail {
    const workspaceName = this.escapeHtml(data.workspaceName || 'Workspace');
    const storiesCompleted = data.storiesCompleted || 0;
    const agentHours = data.agentHours || 0;
    const totalCost = this.escapeHtml(data.totalCost || '0.00');
    const dashboardUrl = this.escapeHtml(data.dashboardUrl || '#');

    const subject = `Weekly Summary - ${this.sanitizeSubject(data.workspaceName || 'Workspace')}`;
    const html = this.wrapInLayout(
      `<h1>Weekly Summary</h1><p>${workspaceName}</p>`,
      `<p>Here's your weekly development summary:</p>
      <div class="alert-box-info">
        <p><strong>Stories Completed:</strong> ${storiesCompleted}</p>
        <p><strong>Agent Hours:</strong> ${agentHours}</p>
        <p><strong>Total Cost:</strong> $${totalCost}</p>
      </div>
      <a href="${dashboardUrl}" class="button">View Full Report</a>`,
      data,
    );
    const text = `Weekly Summary - ${data.workspaceName || ''}\n\nStories Completed: ${storiesCompleted}\nAgent Hours: ${agentHours}\nTotal Cost: $${data.totalCost || '0'}\n\nDashboard: ${data.dashboardUrl || ''}`;

    return { subject, html, text };
  }

  private renderAccountDeletion(data: Record<string, any>): RenderedEmail {
    const recoveryUrl = this.escapeHtml(data.recoveryUrl || '#');

    const subject = 'Account Deletion Confirmation';
    const html = this.wrapInLayout(
      '<h1>Account Deletion</h1>',
      `<p>Your DevOS account has been scheduled for deletion.</p>
      <div class="alert-box-warning">
        <p><strong>30-Day Recovery Window:</strong> Your account and all associated data will be permanently deleted in 30 days. During this period, you can recover your account by signing in.</p>
      </div>
      <a href="${recoveryUrl}" class="button">Recover Account</a>
      <p style="margin-top:20px;color:#6b7280;">If you intended to delete your account, no further action is needed.</p>`,
      data,
    );
    const text = `Account Deletion Confirmation\n\nYour account will be permanently deleted in 30 days.\n\nTo recover: ${data.recoveryUrl || ''}\n\nIf you intended to delete, no action needed.`;

    return { subject, html, text };
  }

  private renderStoryCompleted(data: Record<string, any>): RenderedEmail {
    const storyTitle = this.escapeHtml(data.storyTitle || 'Story');
    const storyKey = this.escapeHtml(data.storyKey || '');
    const viewUrl = this.escapeHtml(data.viewUrl || '#');

    const subject = `Story Completed: ${this.sanitizeSubject(data.storyTitle || 'Story')}`;
    const html = this.wrapInLayout(
      '<h1>Story Completed</h1>',
      `<div class="alert-box-success">
        <h3 style="margin-top: 0;">${storyKey ? storyKey + ': ' : ''}${storyTitle}</h3>
        <p>This story has been completed successfully.</p>
      </div>
      <a href="${viewUrl}" class="button">View Story</a>`,
      data,
    );
    const text = `Story Completed: ${data.storyTitle || ''}\n\nView: ${data.viewUrl || ''}`;

    return { subject, html, text };
  }

  private renderEpicCompleted(data: Record<string, any>): RenderedEmail {
    const epicTitle = this.escapeHtml(data.epicTitle || 'Epic');
    const storyCount = data.storyCount || 0;
    const viewUrl = this.escapeHtml(data.viewUrl || '#');

    const subject = `Epic Completed: ${this.sanitizeSubject(data.epicTitle || 'Epic')}`;
    const html = this.wrapInLayout(
      '<h1>Epic Completed</h1>',
      `<div class="alert-box-success">
        <h3 style="margin-top: 0;">${epicTitle}</h3>
        <p>All ${storyCount} stories in this epic have been completed.</p>
      </div>
      <a href="${viewUrl}" class="button">View Epic</a>`,
      data,
    );
    const text = `Epic Completed: ${data.epicTitle || ''}\n\n${storyCount} stories completed.\n\nView: ${data.viewUrl || ''}`;

    return { subject, html, text };
  }

  private renderDeploymentSuccess(data: Record<string, any>): RenderedEmail {
    const projectName = this.escapeHtml(data.projectName || 'Project');
    const environment = this.escapeHtml(data.environment || 'production');
    const deploymentUrl = this.escapeHtml(data.url || data.deploymentUrl || '#');

    const subject = `Deployment Successful: ${this.sanitizeSubject(data.projectName || 'Project')}`;
    const html = this.wrapInLayout(
      '<h1>Deployment Successful</h1>',
      `<div class="alert-box-success">
        <h3 style="margin-top: 0;">${projectName}</h3>
        <p><strong>Environment:</strong> ${environment}</p>
        <p>The deployment completed successfully.</p>
      </div>
      <a href="${deploymentUrl}" class="button">View Deployment</a>`,
      data,
    );
    const text = `Deployment Successful: ${data.projectName || ''}\n\nEnvironment: ${data.environment || ''}\n\nURL: ${data.url || data.deploymentUrl || ''}`;

    return { subject, html, text };
  }

  private renderDeploymentFailed(data: Record<string, any>): RenderedEmail {
    const projectName = this.escapeHtml(data.projectName || 'Project');
    const environment = this.escapeHtml(data.environment || 'production');
    const errorSummary = this.escapeHtml(data.errorSummary || 'Unknown error');
    const logsUrl = this.escapeHtml(data.logsUrl || '#');

    const subject = `Deployment Failed: ${this.sanitizeSubject(data.projectName || 'Project')}`;
    const html = this.wrapInLayout(
      '<h1>Deployment Failed</h1>',
      `<div class="alert-box-critical">
        <h3 style="margin-top: 0;">${projectName}</h3>
        <p><strong>Environment:</strong> ${environment}</p>
        <p><strong>Error:</strong> ${errorSummary}</p>
      </div>
      <a href="${logsUrl}" class="button">View Logs</a>`,
      data,
    );
    const text = `Deployment Failed: ${data.projectName || ''}\n\nEnvironment: ${data.environment || ''}\nError: ${data.errorSummary || ''}\n\nLogs: ${data.logsUrl || ''}`;

    return { subject, html, text };
  }

  private renderTestEmail(data: Record<string, any>): RenderedEmail {
    const subject = 'DevOS Test Email';
    const html = this.wrapInLayout(
      '<h1>Test Email</h1>',
      `<div class="alert-box-success">
        <p>This is a test email from DevOS. If you're seeing this, your email configuration is working correctly!</p>
      </div>
      <p>Sent at: ${new Date().toISOString()}</p>`,
      data,
    );
    const text = `DevOS Test Email\n\nYour email configuration is working correctly!\n\nSent at: ${new Date().toISOString()}`;

    return { subject, html, text };
  }
}
