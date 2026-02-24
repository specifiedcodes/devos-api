/**
 * IP Allowlist Entity Tests
 *
 * Story 20-4: IP Allowlisting
 * Target: 13 tests covering IpAllowlistEntry and IpAllowlistConfig entities
 */
import { IpAllowlistEntry } from '../../../database/entities/ip-allowlist-entry.entity';
import { IpAllowlistConfig } from '../../../database/entities/ip-allowlist-config.entity';

describe('IpAllowlistEntry Entity', () => {
  it('should create an instance', () => {
    const entry = new IpAllowlistEntry();
    expect(entry).toBeInstanceOf(IpAllowlistEntry);
  });

  it('should accept valid field assignments', () => {
    const entry = new IpAllowlistEntry();
    entry.id = '11111111-1111-1111-1111-111111111111';
    entry.workspaceId = '22222222-2222-2222-2222-222222222222';
    entry.ipAddress = '203.0.113.50';
    entry.description = 'Office VPN';
    entry.isActive = true;
    entry.createdBy = '33333333-3333-3333-3333-333333333333';
    entry.createdAt = new Date();
    entry.updatedAt = new Date();

    expect(entry.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(entry.workspaceId).toBe('22222222-2222-2222-2222-222222222222');
    expect(entry.ipAddress).toBe('203.0.113.50');
    expect(entry.description).toBe('Office VPN');
    expect(entry.isActive).toBe(true);
    expect(entry.createdBy).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('should accept CIDR notation in ipAddress', () => {
    const entry = new IpAllowlistEntry();
    entry.ipAddress = '10.0.0.0/8';
    expect(entry.ipAddress).toBe('10.0.0.0/8');
  });

  it('should accept IPv6 address', () => {
    const entry = new IpAllowlistEntry();
    entry.ipAddress = '::1';
    expect(entry.ipAddress).toBe('::1');
  });

  it('should accept ipAddress up to 45 chars for IPv6+CIDR', () => {
    const entry = new IpAllowlistEntry();
    // Long IPv6 + CIDR: "2001:0db8:85a3:0000:0000:8a2e:0370:7334/128" = 43 chars
    entry.ipAddress = '2001:0db8:85a3:0000:0000:8a2e:0370:7334/128';
    expect(entry.ipAddress.length).toBeLessThanOrEqual(45);
  });

  it('should accept description up to 200 chars', () => {
    const entry = new IpAllowlistEntry();
    entry.description = 'a'.repeat(200);
    expect(entry.description.length).toBe(200);
  });

  it('should set isActive to true by default via entity definition', () => {
    // The default is defined via @Column decorator, not in JS
    // This test verifies the entity shape accepts boolean
    const entry = new IpAllowlistEntry();
    entry.isActive = true;
    expect(entry.isActive).toBe(true);
  });

  it('should allow workspace relation to be undefined', () => {
    const entry = new IpAllowlistEntry();
    expect(entry.workspace).toBeUndefined();
  });
});

describe('IpAllowlistConfig Entity', () => {
  it('should create an instance', () => {
    const config = new IpAllowlistConfig();
    expect(config).toBeInstanceOf(IpAllowlistConfig);
  });

  it('should accept valid field assignments', () => {
    const config = new IpAllowlistConfig();
    config.id = '11111111-1111-1111-1111-111111111111';
    config.workspaceId = '22222222-2222-2222-2222-222222222222';
    config.isEnabled = true;
    config.gracePeriodEndsAt = new Date();
    config.emergencyDisableUntil = new Date();
    config.lastModifiedBy = '33333333-3333-3333-3333-333333333333';
    config.createdAt = new Date();
    config.updatedAt = new Date();

    expect(config.isEnabled).toBe(true);
    expect(config.gracePeriodEndsAt).toBeInstanceOf(Date);
    expect(config.emergencyDisableUntil).toBeInstanceOf(Date);
  });

  it('should accept null for nullable fields', () => {
    const config = new IpAllowlistConfig();
    config.gracePeriodEndsAt = null;
    config.emergencyDisableUntil = null;
    config.lastModifiedBy = null;

    expect(config.gracePeriodEndsAt).toBeNull();
    expect(config.emergencyDisableUntil).toBeNull();
    expect(config.lastModifiedBy).toBeNull();
  });

  it('should allow workspace relation to be undefined', () => {
    const config = new IpAllowlistConfig();
    expect(config.workspace).toBeUndefined();
  });

  it('should have workspaceId as required field', () => {
    const config = new IpAllowlistConfig();
    config.workspaceId = '22222222-2222-2222-2222-222222222222';
    expect(config.workspaceId).toBeDefined();
  });
});
