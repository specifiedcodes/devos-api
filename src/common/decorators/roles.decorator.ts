import { SetMetadata } from '@nestjs/common';
import { WorkspaceRole } from '../../database/entities/workspace-member.entity';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route
 * @param roles - Array of workspace roles that can access the route
 */
export const Roles = (...roles: WorkspaceRole[]) =>
  SetMetadata(ROLES_KEY, roles);
