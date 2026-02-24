/**
 * Endpoint-to-Permission Mapping
 * Story 20-3: Permission Enforcement Middleware
 *
 * This file defines the canonical mapping of API endpoints to required permissions.
 * Controllers should use the @Permission decorator with these resource:action pairs.
 *
 * Convention:
 * - Endpoints that require no specific permission (e.g., auth endpoints, health checks)
 *   should NOT use the @Permission decorator - they rely on @UseGuards(JwtAuthGuard) only.
 * - Endpoints guarded by @RequireRole (RoleGuard) can ALSO use @Permission for granular control.
 *   When both are used, @RequireRole checks system role first, then @Permission checks granular permission.
 * - Unmapped endpoints (no @Permission decorator) are not blocked by PermissionGuard -
 *   they continue to work as before with only JwtAuthGuard and/or RoleGuard.
 */
export const ENDPOINT_PERMISSION_MAP = {
  // === Projects ===
  'POST /api/v1/workspaces/:workspaceId/projects': { resource: 'projects', action: 'create' },
  'GET /api/v1/workspaces/:workspaceId/projects': { resource: 'projects', action: 'read' },
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId': { resource: 'projects', action: 'read' },
  'PUT /api/v1/workspaces/:workspaceId/projects/:projectId': { resource: 'projects', action: 'update' },
  'DELETE /api/v1/workspaces/:workspaceId/projects/:projectId': { resource: 'projects', action: 'delete' },
  'PUT /api/v1/workspaces/:workspaceId/projects/:projectId/settings': { resource: 'projects', action: 'manage_settings' },

  // === Agents ===
  'GET /api/v1/workspaces/:workspaceId/agents': { resource: 'agents', action: 'view' },
  'GET /api/v1/workspaces/:workspaceId/agents/:agentId': { resource: 'agents', action: 'view' },
  'POST /api/v1/workspaces/:workspaceId/agents': { resource: 'agents', action: 'create_custom' },
  'POST /api/v1/workspaces/:workspaceId/agent-queue/tasks': { resource: 'agents', action: 'assign_tasks' },
  'POST /api/v1/workspaces/:workspaceId/agents/:agentId/pause': { resource: 'agents', action: 'pause_cancel' },
  'POST /api/v1/workspaces/:workspaceId/agents/:agentId/cancel': { resource: 'agents', action: 'pause_cancel' },
  'PUT /api/v1/workspaces/:workspaceId/agents/:agentId/config': { resource: 'agents', action: 'configure' },

  // === Stories ===
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/stories': { resource: 'stories', action: 'create' },
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/stories': { resource: 'stories', action: 'read' },
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/stories/:storyId': { resource: 'stories', action: 'read' },
  'PUT /api/v1/workspaces/:workspaceId/projects/:projectId/stories/:storyId': { resource: 'stories', action: 'update' },
  'DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/stories/:storyId': { resource: 'stories', action: 'delete' },
  'PUT /api/v1/workspaces/:workspaceId/projects/:projectId/stories/:storyId/assign': { resource: 'stories', action: 'assign' },
  'PUT /api/v1/workspaces/:workspaceId/projects/:projectId/stories/:storyId/status': { resource: 'stories', action: 'change_status' },

  // === Deployments ===
  'GET /api/v1/workspaces/:workspaceId/deployments': { resource: 'deployments', action: 'view' },
  'POST /api/v1/workspaces/:workspaceId/deployments/trigger': { resource: 'deployments', action: 'trigger' },
  'POST /api/v1/workspaces/:workspaceId/deployments/:deploymentId/approve': { resource: 'deployments', action: 'approve' },
  'POST /api/v1/workspaces/:workspaceId/deployments/:deploymentId/rollback': { resource: 'deployments', action: 'rollback' },
  'PUT /api/v1/workspaces/:workspaceId/deployments/config': { resource: 'deployments', action: 'configure' },

  // === Secrets (BYOK Keys) ===
  'GET /api/v1/workspaces/:workspaceId/byok-keys': { resource: 'secrets', action: 'view_masked' },
  'POST /api/v1/workspaces/:workspaceId/byok-keys': { resource: 'secrets', action: 'create' },
  'PUT /api/v1/workspaces/:workspaceId/byok-keys/:keyId': { resource: 'secrets', action: 'update' },
  'DELETE /api/v1/workspaces/:workspaceId/byok-keys/:keyId': { resource: 'secrets', action: 'delete' },
  'GET /api/v1/workspaces/:workspaceId/byok-keys/:keyId/value': { resource: 'secrets', action: 'view_plaintext' },

  // === Integrations ===
  'GET /api/v1/workspaces/:workspaceId/integrations': { resource: 'integrations', action: 'view' },
  'POST /api/v1/workspaces/:workspaceId/integrations/connect': { resource: 'integrations', action: 'connect' },
  'POST /api/v1/workspaces/:workspaceId/integrations/:integrationId/disconnect': { resource: 'integrations', action: 'disconnect' },
  'PUT /api/v1/workspaces/:workspaceId/integrations/:integrationId/config': { resource: 'integrations', action: 'configure' },

  // === Workspace Management ===
  'GET /api/v1/workspaces/:workspaceId/members': { resource: 'workspace', action: 'view_members' },
  'POST /api/v1/workspaces/:workspaceId/invitations': { resource: 'workspace', action: 'invite_members' },
  'DELETE /api/v1/workspaces/:workspaceId/members/:memberId': { resource: 'workspace', action: 'remove_members' },
  'PUT /api/v1/workspaces/:workspaceId/members/:memberId/role': { resource: 'workspace', action: 'manage_roles' },
  'GET /api/v1/workspaces/:workspaceId/audit-logs': { resource: 'workspace', action: 'view_audit_log' },
  'PUT /api/v1/workspaces/:workspaceId/settings': { resource: 'workspace', action: 'manage_settings' },

  // === Cost Management ===
  'GET /api/v1/workspaces/:workspaceId/usage/own': { resource: 'cost_management', action: 'view_own_usage' },
  'GET /api/v1/workspaces/:workspaceId/usage': { resource: 'cost_management', action: 'view_workspace_usage' },
  'PUT /api/v1/workspaces/:workspaceId/spending-limits': { resource: 'cost_management', action: 'set_budgets' },
  'GET /api/v1/workspaces/:workspaceId/usage/export': { resource: 'cost_management', action: 'export_reports' },
} as const;
