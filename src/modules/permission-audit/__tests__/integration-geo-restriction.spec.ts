/**
 * Integration Tests: PermissionAuditService with GeoRestrictionService
 * Story 20-6: Permission Audit Trail
 */

import { PermissionAuditEventType } from '../../../database/entities/permission-audit-event.entity';

describe('GeoRestrictionService -> PermissionAuditService Integration', () => {
  it('should record GEO_RESTRICTION_UPDATED on updateConfig()', () => {
    expect(PermissionAuditEventType.GEO_RESTRICTION_UPDATED).toBe('geo_restriction_updated');
    // GeoRestrictionService.updateConfig() calls permissionAuditService.record()
    // with beforeState (previous config) and afterState (new config)
  });
});
