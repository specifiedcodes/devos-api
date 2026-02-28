import { DocumentBuilder, SwaggerCustomOptions } from '@nestjs/swagger';

/**
 * Swagger Configuration Module
 * Story 16.10: Swagger API Documentation (AC9)
 *
 * Centralizes OpenAPI/Swagger configuration for the DevOS API.
 * Used by main.ts to set up Swagger UI at /api/docs.
 */
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('DevOS API')
    .setDescription(
      'API documentation for the DevOS platform - an AI-powered autonomous development platform. ' +
      'All authenticated endpoints require a valid JWT Bearer token obtained from POST /api/auth/login.',
    )
    .setVersion('1.0.0')
    .setContact('DevOS Team', 'https://devos.app', 'support@devos.app')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token from /api/auth/login',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'User registration, login, 2FA, sessions, and profile management')
    .addTag('Workspaces', 'Workspace CRUD, members, invitations, and role management')
    .addTag('Projects', 'Project CRUD, preferences, and AI configuration')
    .addTag('Stories', 'Story/task CRUD, status transitions, and assignment')
    .addTag('Sprints', 'Sprint management, planning, and completion')
    .addTag('Agents', 'AI agent spawning, status, and task management')
    .addTag('Agent Queue', 'BullMQ job queue management for agent tasks')
    .addTag('Orchestrator', 'Super orchestrator pipeline and agent coordination')
    .addTag('Integrations', 'GitHub, Railway, Vercel, Supabase integrations')
    .addTag('GitHub Repositories', 'GitHub repository creation and management')
    .addTag('GitHub Branches', 'GitHub branch operations')
    .addTag('GitHub Pull Requests', 'GitHub PR creation and management')
    .addTag('Deployments', 'Deployment monitoring, approvals, and rollbacks')
    .addTag('BYOK', 'Bring-Your-Own-Key management for AI providers')
    .addTag('Usage & Costs', 'API usage tracking, cost reports, and spend caps')
    .addTag('Chat', 'Agent chat, conversations, and messaging')
    .addTag('Chat Rooms', 'Multi-user chat room management')
    .addTag('Notifications', 'Notification preferences, push subscriptions')
    .addTag('Push Notifications', 'Web Push VAPID and subscription management')
    .addTag('Integrations - Slack', 'Slack notification channel integration')
    .addTag('Integrations - Discord', 'Discord webhook notification integration')
    .addTag('Integrations - Email', 'Email notification service integration')
    .addTag('File Storage', 'Project file upload, download, and management')
    .addTag('CLI Sessions', 'CLI session recording, replay, and archival')
    .addTag('Memory', 'AI memory ingestion, querying, and lifecycle')
    .addTag('Context', 'Three-tier context recovery system')
    .addTag('Model Registry', 'AI model registry and provider management')
    .addTag('Model Preferences', 'User/workspace model routing preferences')
    .addTag('Benchmarks', 'AI model performance benchmarks')
    .addTag('Analytics', 'Frontend analytics event tracking')
    .addTag('Project Analytics', 'Burndown, velocity, throughput, and agent metrics')
    .addTag('Admin - Users', 'Platform admin user management')
    .addTag('Admin - Analytics', 'Platform admin analytics and reports')
    .addTag('Admin - Alerts', 'Alert rules and notification management')
    .addTag('Admin - Incidents', 'Incident management and resolution')
    .addTag('Admin - Audit Logs', 'Platform-wide audit log viewer and export')
    .addTag('Workspace Audit Logs', 'Per-workspace audit log viewing')
    .addTag('Workspace Settings', 'Workspace spending limits and settings')
    .addTag('Onboarding', 'User onboarding flow and wizard steps')
    .addTag('Templates', 'Project template registry')
    .addTag('Provisioning', 'Auto-provisioning status tracking')
    .addTag('Shared Links', 'Read-only project sharing')
    .addTag('Kanban Preferences', 'User Kanban board customization')
    .addTag('Health', 'Application and dependency health checks')
    .addTag('Metrics', 'Prometheus metrics endpoint')
    .addTag('Agent Status', 'Agent activity status tracking and history')
    .addTag('Agent Metrics', 'Agent performance metrics and alerts')
    .addTag('Notification Preferences', 'Per-user notification preference management')
    .addTag('White-Label', 'White-label branding configuration and custom domain management')
    .build();
}

export const swaggerCustomOptions: SwaggerCustomOptions = {
  swaggerOptions: {
    persistAuthorization: true,
    tagsSorter: 'alpha',
    operationsSorter: 'method',
    docExpansion: 'none',
    filter: true,
    showRequestDuration: true,
  },
  customSiteTitle: 'DevOS API Documentation',
  customCss: '.swagger-ui .topbar { display: none }',
};
