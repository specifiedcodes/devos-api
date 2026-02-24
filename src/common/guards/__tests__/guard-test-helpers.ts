/**
 * Shared Guard Test Helpers
 *
 * Story 20-8: Permission Testing Suite
 *
 * Shared factory functions for creating mock ExecutionContext objects
 * used across IP allowlist and geo-restriction guard tests.
 * Extracted to avoid duplication between ip-permission-combined.spec.ts
 * and geo-permission-combined.spec.ts.
 */

import { ExecutionContext } from '@nestjs/common';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

export interface MockContextOverrides {
  user?: any;
  params?: any;
  body?: any;
  query?: any;
  workspaceRole?: WorkspaceRole;
  ip?: string;
  url?: string;
  path?: string;
  method?: string;
}

/**
 * Create a mock ExecutionContext for guard tests.
 * Includes request.ip, request.connection.remoteAddress, headers, and all
 * fields needed by IpAllowlistGuard, GeoRestrictionGuard, and PermissionGuard.
 */
export function createMockContext(
  defaults: { workspaceId: string; userId: string; defaultIp: string },
  overrides?: MockContextOverrides,
): ExecutionContext {
  const request = {
    user: overrides?.user ?? { id: defaults.userId },
    params: overrides?.params ?? { workspaceId: defaults.workspaceId },
    body: overrides?.body ?? {},
    query: overrides?.query ?? {},
    workspaceRole: overrides?.workspaceRole,
    ip: overrides?.ip ?? defaults.defaultIp,
    url: overrides?.url ?? '/api/v1/workspaces/ws/projects',
    path: overrides?.path ?? '/api/v1/workspaces/ws/projects',
    method: overrides?.method ?? 'GET',
    headers: { 'user-agent': 'test-agent' },
    connection: { remoteAddress: overrides?.ip ?? defaults.defaultIp },
  };

  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
  } as any;
}
