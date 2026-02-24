import { SetMetadata } from '@nestjs/common';
import { SKIP_IP_CHECK_KEY } from '../guards/ip-allowlist.guard';

/**
 * Decorator to skip IP allowlist checking for specific endpoints.
 * Use on endpoints that must be accessible regardless of IP restrictions
 * (e.g., IP allowlist management endpoints, health checks).
 *
 * @example
 * @SkipIpCheck()
 * @Get('/api/workspaces/:workspaceId/ip-allowlist')
 * async listEntries() { ... }
 */
export const SkipIpCheck = () => SetMetadata(SKIP_IP_CHECK_KEY, true);
