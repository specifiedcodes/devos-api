import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

/**
 * Decorator to declare required permission for an endpoint.
 * Used by PermissionGuard to enforce granular access control.
 *
 * @param resource - Resource type from ResourceType enum (e.g., 'projects', 'deployments')
 * @param action - Permission action (e.g., 'create', 'approve', 'view_plaintext')
 *
 * @example
 * @Permission('projects', 'create')
 * @Post('/api/projects')
 * async createProject() { ... }
 *
 * @example
 * @Permission('deployments', 'approve')
 * @Post('/api/deployments/:id/approve')
 * async approveDeployment() { ... }
 *
 * @example
 * @Permission('secrets', 'view_plaintext')
 * @Get('/api/secrets/:id/value')
 * async getSecretValue() { ... }
 */
export const Permission = (resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action });
