/**
 * GeoRestrictionResponseDto Tests
 * Story 20-5: Geo-Restriction
 * Target: 5 tests covering response DTO mapping
 */
import { GeoRestrictionResponseDto } from '../dto/geo-restriction-response.dto';
import { GeoRestriction, GeoRestrictionMode } from '../../../database/entities/geo-restriction.entity';

describe('GeoRestrictionResponseDto', () => {
  const createMockEntity = (overrides: Partial<GeoRestriction> = {}): GeoRestriction => ({
    id: '33333333-3333-3333-3333-333333333333',
    workspaceId: '11111111-1111-1111-1111-111111111111',
    mode: GeoRestrictionMode.BLOCKLIST,
    countries: ['US', 'GB'],
    isActive: true,
    logOnly: false,
    createdBy: '22222222-2222-2222-2222-222222222222',
    lastModifiedBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });

  describe('fromEntity', () => {
    it('should map all entity fields to DTO', () => {
      const entity = createMockEntity();
      const dto = GeoRestrictionResponseDto.fromEntity(entity);

      expect(dto.id).toBe(entity.id);
      expect(dto.workspaceId).toBe(entity.workspaceId);
      expect(dto.mode).toBe(entity.mode);
      expect(dto.countries).toEqual(entity.countries);
      expect(dto.isActive).toBe(entity.isActive);
      expect(dto.logOnly).toBe(entity.logOnly);
      expect(dto.createdBy).toBe(entity.createdBy);
      expect(dto.lastModifiedBy).toBe(entity.lastModifiedBy);
      expect(dto.createdAt).toBe(entity.createdAt);
      expect(dto.updatedAt).toBe(entity.updatedAt);
    });

    it('should preserve allowlist mode', () => {
      const entity = createMockEntity({ mode: GeoRestrictionMode.ALLOWLIST });
      const dto = GeoRestrictionResponseDto.fromEntity(entity);
      expect(dto.mode).toBe('allowlist');
    });

    it('should preserve empty countries array', () => {
      const entity = createMockEntity({ countries: [] });
      const dto = GeoRestrictionResponseDto.fromEntity(entity);
      expect(dto.countries).toEqual([]);
    });

    it('should preserve null lastModifiedBy', () => {
      const entity = createMockEntity({ lastModifiedBy: null });
      const dto = GeoRestrictionResponseDto.fromEntity(entity);
      expect(dto.lastModifiedBy).toBeNull();
    });

    it('should preserve lastModifiedBy when set', () => {
      const entity = createMockEntity({ lastModifiedBy: '44444444-4444-4444-4444-444444444444' });
      const dto = GeoRestrictionResponseDto.fromEntity(entity);
      expect(dto.lastModifiedBy).toBe('44444444-4444-4444-4444-444444444444');
    });
  });
});
