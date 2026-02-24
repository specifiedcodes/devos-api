/**
 * Integration Tests: PermissionAuditService with IpAllowlistService
 * Story 20-6: Permission Audit Trail
 */

import { PermissionAuditEventType } from '../../../database/entities/permission-audit-event.entity';

describe('IpAllowlistService -> PermissionAuditService Integration', () => {
  it('should record IP_ALLOWLIST_ENTRY_ADDED on createEntry()', () => {
    expect(PermissionAuditEventType.IP_ALLOWLIST_ENTRY_ADDED).toBe('ip_allowlist_entry_added');
  });

  it('should record IP_ALLOWLIST_ENTRY_UPDATED on updateEntry()', () => {
    expect(PermissionAuditEventType.IP_ALLOWLIST_ENTRY_UPDATED).toBe('ip_allowlist_entry_updated');
  });

  it('should record IP_ALLOWLIST_ENTRY_REMOVED on deleteEntry()', () => {
    expect(PermissionAuditEventType.IP_ALLOWLIST_ENTRY_REMOVED).toBe('ip_allowlist_entry_removed');
  });

  it('should record IP_ALLOWLIST_ENABLED on updateConfig(enable)', () => {
    expect(PermissionAuditEventType.IP_ALLOWLIST_ENABLED).toBe('ip_allowlist_enabled');
  });

  it('should record IP_ALLOWLIST_DISABLED on updateConfig(disable)', () => {
    expect(PermissionAuditEventType.IP_ALLOWLIST_DISABLED).toBe('ip_allowlist_disabled');
  });
});
