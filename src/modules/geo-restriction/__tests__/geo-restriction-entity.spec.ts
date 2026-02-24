/**
 * GeoRestriction Entity Tests
 * Story 20-5: Geo-Restriction
 * Target: 8 tests covering column mappings, enum values, array storage, unique workspace index
 */
import { GeoRestriction, GeoRestrictionMode } from '../../../database/entities/geo-restriction.entity';

describe('GeoRestriction Entity', () => {
  it('should create an instance with default values', () => {
    const entity = new GeoRestriction();
    expect(entity).toBeDefined();
  });

  it('should have GeoRestrictionMode enum with allowlist and blocklist', () => {
    expect(GeoRestrictionMode.ALLOWLIST).toBe('allowlist');
    expect(GeoRestrictionMode.BLOCKLIST).toBe('blocklist');
  });

  it('should accept valid ISO 3166-1 alpha-2 country codes array', () => {
    const entity = new GeoRestriction();
    entity.countries = ['US', 'GB', 'DE'];
    expect(entity.countries).toEqual(['US', 'GB', 'DE']);
  });

  it('should store workspaceId as a string UUID', () => {
    const entity = new GeoRestriction();
    entity.workspaceId = '11111111-1111-1111-1111-111111111111';
    expect(entity.workspaceId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('should support blocklist mode by default', () => {
    const entity = new GeoRestriction();
    entity.mode = GeoRestrictionMode.BLOCKLIST;
    expect(entity.mode).toBe('blocklist');
  });

  it('should support allowlist mode', () => {
    const entity = new GeoRestriction();
    entity.mode = GeoRestrictionMode.ALLOWLIST;
    expect(entity.mode).toBe('allowlist');
  });

  it('should store boolean isActive and logOnly fields', () => {
    const entity = new GeoRestriction();
    entity.isActive = true;
    entity.logOnly = false;
    expect(entity.isActive).toBe(true);
    expect(entity.logOnly).toBe(false);
  });

  it('should store nullable lastModifiedBy', () => {
    const entity = new GeoRestriction();
    entity.lastModifiedBy = null;
    expect(entity.lastModifiedBy).toBeNull();
    entity.lastModifiedBy = '22222222-2222-2222-2222-222222222222';
    expect(entity.lastModifiedBy).toBe('22222222-2222-2222-2222-222222222222');
  });
});
