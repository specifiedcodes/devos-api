/**
 * Tests for PermissionAuditEvent Entity
 * Story 20-6: Permission Audit Trail
 */

import { PermissionAuditEvent, PermissionAuditEventType } from '../../../database/entities/permission-audit-event.entity';

describe('PermissionAuditEvent Entity', () => {
  it('should create an instance with all required fields', () => {
    const event = new PermissionAuditEvent();
    event.id = '11111111-1111-1111-1111-111111111111';
    event.workspaceId = '22222222-2222-2222-2222-222222222222';
    event.eventType = PermissionAuditEventType.ROLE_CREATED;
    event.actorId = '33333333-3333-3333-3333-333333333333';
    event.targetUserId = null;
    event.targetRoleId = null;
    event.beforeState = null;
    event.afterState = null;
    event.ipAddress = null;
    event.userAgent = null;

    expect(event.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(event.workspaceId).toBe('22222222-2222-2222-2222-222222222222');
    expect(event.eventType).toBe(PermissionAuditEventType.ROLE_CREATED);
    expect(event.actorId).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('should allow nullable fields to be null', () => {
    const event = new PermissionAuditEvent();
    event.targetUserId = null;
    event.targetRoleId = null;
    event.beforeState = null;
    event.afterState = null;
    event.ipAddress = null;
    event.userAgent = null;

    expect(event.targetUserId).toBeNull();
    expect(event.targetRoleId).toBeNull();
    expect(event.beforeState).toBeNull();
    expect(event.afterState).toBeNull();
    expect(event.ipAddress).toBeNull();
    expect(event.userAgent).toBeNull();
  });

  it('should accept JSONB before_state and after_state', () => {
    const event = new PermissionAuditEvent();
    event.beforeState = { name: 'old-role', baseRole: 'viewer' };
    event.afterState = { name: 'new-role', baseRole: 'admin' };

    expect(event.beforeState).toEqual({ name: 'old-role', baseRole: 'viewer' });
    expect(event.afterState).toEqual({ name: 'new-role', baseRole: 'admin' });
  });

  it('should accept target user and role IDs', () => {
    const event = new PermissionAuditEvent();
    event.targetUserId = '44444444-4444-4444-4444-444444444444';
    event.targetRoleId = '55555555-5555-5555-5555-555555555555';

    expect(event.targetUserId).toBe('44444444-4444-4444-4444-444444444444');
    expect(event.targetRoleId).toBe('55555555-5555-5555-5555-555555555555');
  });

  it('should have all 18 event types defined', () => {
    const types = Object.values(PermissionAuditEventType);
    expect(types).toHaveLength(18);
    expect(types).toContain('role_created');
    expect(types).toContain('role_updated');
    expect(types).toContain('role_deleted');
    expect(types).toContain('role_cloned');
    expect(types).toContain('permission_granted');
    expect(types).toContain('permission_revoked');
    expect(types).toContain('permission_bulk_updated');
    expect(types).toContain('member_role_changed');
    expect(types).toContain('member_removed');
    expect(types).toContain('ip_allowlist_entry_added');
    expect(types).toContain('ip_allowlist_entry_removed');
    expect(types).toContain('ip_allowlist_entry_updated');
    expect(types).toContain('ip_allowlist_enabled');
    expect(types).toContain('ip_allowlist_disabled');
    expect(types).toContain('geo_restriction_updated');
    expect(types).toContain('access_denied_ip');
    expect(types).toContain('access_denied_geo');
    expect(types).toContain('access_denied_permission');
  });

  it('should store IP address and user agent', () => {
    const event = new PermissionAuditEvent();
    event.ipAddress = '192.168.1.1';
    event.userAgent = 'Mozilla/5.0';

    expect(event.ipAddress).toBe('192.168.1.1');
    expect(event.userAgent).toBe('Mozilla/5.0');
  });

  it('should have workspace relationship defined', () => {
    const event = new PermissionAuditEvent();
    // workspace is optional (lazy loaded)
    expect(event.workspace).toBeUndefined();
  });

  it('should have actor relationship defined', () => {
    const event = new PermissionAuditEvent();
    expect(event.actor).toBeUndefined();
  });
});
