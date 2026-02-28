/**
 * Default Email Templates
 * Story 22-2: White-Label Email Templates (AC10)
 *
 * Default template content for all 6 email types with white-label variable support.
 */

import { WhiteLabelEmailTemplateType } from '../../../database/entities/white-label-email-template.entity';

export interface DefaultTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

const createEmailLayout = (
  headerContent: string,
  bodyContent: string,
  primaryColor: string = '{{primary_color}}',
): string => {
  return '<!DOCTYPE html>' +
'<html>' +
'<head>' +
'  <meta charset="utf-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1">' +
'  <style>' +
'    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }' +
'    .container { max-width: 600px; margin: 0 auto; padding: 20px; }' +
'    .header { background: ' + primaryColor + '; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }' +
'    .header img { max-height: 40px; margin-bottom: 16px; }' +
'    .content { background: white; padding: 30px; border-radius: 0 0 8px 8px; }' +
'    .button { display: inline-block; background: ' + primaryColor + '; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }' +
'    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; padding: 20px; }' +
'    .footer a { color: ' + primaryColor + '; }' +
'    .alert-box-warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }' +
'    .alert-box-critical { background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 4px; }' +
'    .alert-box-success { background: #d1fae5; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px; }' +
'    .alert-box-info { background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px; }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="container">' +
'    <div class="header">' +
'      <img src="{{logo_url}}" alt="{{app_name}}">' +
      headerContent +
'    </div>' +
'    <div class="content">' +
      bodyContent +
'    </div>' +
'    <div class="footer">' +
'      <p>{{app_name}}</p>' +
'      <p><a href="{{unsubscribe_url}}">Email Preferences</a></p>' +
'    </div>' +
'  </div>' +
'</body>' +
'</html>';
};

export const DEFAULT_EMAIL_TEMPLATES: Record<WhiteLabelEmailTemplateType, DefaultTemplate> = {
  [WhiteLabelEmailTemplateType.INVITATION]: {
    subject: "You've been invited to join {{app_name}}",
    bodyHtml: createEmailLayout(
      '<h1>Workspace Invitation</h1>',
      '<p>Hi {{user_name}},</p>' +
      '<p>You\'ve been invited to join <strong>{{workspace_name}}</strong> on {{app_name}}.</p>' +
      '<div class="alert-box-info">' +
        '<p><strong>Role:</strong> {{role}}</p>' +
        '<p><strong>Workspace:</strong> {{workspace_name}}</p>' +
      '</div>' +
      '<p style="text-align: center;">' +
        '<a href="{{action_url}}" class="button">Accept Invitation</a>' +
      '</p>',
    ),
    bodyText: "You've been invited to join {{workspace_name}} on {{app_name}}\n\n" +
"Hi {{user_name}},\n\n" +
"You've been invited to join {{workspace_name}} as a {{role}}.\n\n" +
"Accept your invitation: {{action_url}}\n\n" +
"---\n" +
"{{app_name}}",
  },

  [WhiteLabelEmailTemplateType.PASSWORD_RESET]: {
    subject: 'Reset your {{app_name}} password',
    bodyHtml: createEmailLayout(
      '<h1>Password Reset</h1>',
      '<p>Hi {{user_name}},</p>' +
      '<p>You requested a password reset for your {{app_name}} account.</p>' +
      '<p>Click the button below to reset your password. This link will expire in <strong>1 hour</strong>.</p>' +
      '<p style="text-align: center;">' +
        '<a href="{{action_url}}" class="button">Reset Password</a>' +
      '</p>' +
      '<div class="alert-box-warning">' +
        '<p><strong>Didn\'t request this?</strong> If you didn\'t request a password reset, you can safely ignore this email. Your password will not be changed.</p>' +
      '</div>',
    ),
    bodyText: 'Reset your {{app_name}} password\n\n' +
'Hi {{user_name}},\n\n' +
'You requested a password reset. This link expires in 1 hour.\n\n' +
'Reset your password: {{action_url}}\n\n' +
'If you didn\'t request this, you can safely ignore this email.\n\n' +
'---\n' +
'{{app_name}}',
  },

  [WhiteLabelEmailTemplateType.TWO_FA_SETUP]: {
    subject: 'Two-factor authentication enabled on {{app_name}}',
    bodyHtml: createEmailLayout(
      '<h1>2FA Enabled</h1>',
      '<p>Hi {{user_name}},</p>' +
      '<p>Two-factor authentication has been enabled on your {{app_name}} account.</p>' +
      '<div class="alert-box-success">' +
        '<p><strong>Security Notice:</strong> Your account is now protected with an additional layer of security.</p>' +
      '</div>' +
      '<p>Store your backup codes in a safe place. Each code can only be used once if you lose access to your authenticator device.</p>' +
      '<p style="text-align: center;">' +
        '<a href="{{action_url}}" class="button">Manage Security Settings</a>' +
      '</p>',
    ),
    bodyText: 'Two-factor authentication enabled on {{app_name}}\n\n' +
'Hi {{user_name}},\n\n' +
'Two-factor authentication has been enabled on your account.\n\n' +
'Manage your security settings: {{action_url}}\n\n' +
'---\n' +
'{{app_name}}',
  },

  [WhiteLabelEmailTemplateType.DEPLOYMENT]: {
    subject: 'Deployment {{status}} for {{project_name}}',
    bodyHtml: createEmailLayout(
      '<h1>Deployment Update</h1>',
      '<p>Hi {{user_name}},</p>' +
      '<div class="alert-box-{{alert_class}}">' +
        '<p><strong>Project:</strong> {{project_name}}</p>' +
        '<p><strong>Environment:</strong> {{environment}}</p>' +
        '<p><strong>Status:</strong> {{status}}</p>' +
      '</div>' +
      '<p style="text-align: center;">' +
        '<a href="{{action_url}}" class="button">View Deployment</a>' +
      '</p>',
    ),
    bodyText: 'Deployment {{status}} for {{project_name}}\n\n' +
'Project: {{project_name}}\n' +
'Environment: {{environment}}\n' +
'Status: {{status}}\n\n' +
'View deployment: {{action_url}}\n\n' +
'---\n' +
'{{app_name}}',
  },

  [WhiteLabelEmailTemplateType.COST_ALERT]: {
    subject: 'API usage at {{percentage}}% of budget',
    bodyHtml: createEmailLayout(
      '<h1>Spending Alert</h1>',
      '<p>Hi {{user_name}},</p>' +
      '<div class="alert-box-{{alert_class}}">' +
        '<p><strong>Workspace:</strong> {{workspace_name}}</p>' +
        '<p><strong>Current Spend:</strong> &#36;{{current_spend}}</p>' +
        '<p><strong>Monthly Limit:</strong> &#36;{{limit}}</p>' +
        '<p><strong>Percentage Used:</strong> {{percentage}}%</p>' +
      '</div>' +
      '<p style="text-align: center;">' +
        '<a href="{{action_url}}" class="button">View Usage Dashboard</a>' +
      '</p>',
    ),
    bodyText: 'API usage at {{percentage}}% of budget\n\n' +
'Workspace: {{workspace_name}}\n' +
'Current Spend: $' + '{{current_spend}}\n' +
'Monthly Limit: $' + '{{limit}}\n' +
'Percentage Used: {{percentage}}%\n\n' +
'View usage dashboard: {{action_url}}\n\n' +
'---\n' +
'{{app_name}}',
  },

  [WhiteLabelEmailTemplateType.WEEKLY_DIGEST]: {
    subject: 'Your weekly {{app_name}} summary',
    bodyHtml: createEmailLayout(
      '<h1>Weekly Summary</h1>',
      '<p>Hi {{user_name}},</p>' +
      '<p>Here\'s your weekly development summary for <strong>{{workspace_name}}</strong>:</p>' +
      '<div class="alert-box-info">' +
        '<p><strong>Stories Completed:</strong> {{stories_completed}}</p>' +
        '<p><strong>Agent Hours:</strong> {{agent_hours}}</p>' +
        '<p><strong>Total Cost:</strong> &#36;{{total_cost}}</p>' +
      '</div>' +
      '<p style="text-align: center;">' +
        '<a href="{{action_url}}" class="button">View Full Report</a>' +
      '</p>',
    ),
    bodyText: 'Your weekly {{app_name}} summary\n\n' +
'Hi {{user_name}},\n\n' +
'Weekly summary for {{workspace_name}}:\n\n' +
'Stories Completed: {{stories_completed}}\n' +
'Agent Hours: {{agent_hours}}\n' +
'Total Cost: $' + '{{total_cost}}\n\n' +
'View full report: {{action_url}}\n\n' +
'---\n' +
'{{app_name}}',
  },
};

export function getDefaultTemplate(
  templateType: WhiteLabelEmailTemplateType,
): DefaultTemplate {
  return DEFAULT_EMAIL_TEMPLATES[templateType];
}
