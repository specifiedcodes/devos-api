import { SetMetadata } from '@nestjs/common';
import { SKIP_GEO_CHECK_KEY } from '../guards/geo-restriction.guard';

/**
 * Decorator to skip geo-restriction checking for specific endpoints.
 * Use on endpoints that must be accessible regardless of geo-restrictions
 * (e.g., geo-restriction management endpoints, health checks).
 *
 * @example
 * @SkipGeoCheck()
 * @Get('/api/workspaces/:workspaceId/geo-restriction')
 * async getConfig() { ... }
 */
export const SkipGeoCheck = () => SetMetadata(SKIP_GEO_CHECK_KEY, true);
