/**
 * UpdateGeoRestrictionDto Validation Tests
 * Story 20-5: Geo-Restriction
 * Target: 10 tests covering DTO validation rules
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateGeoRestrictionDto } from '../dto/update-geo-restriction.dto';
import { GeoRestrictionMode } from '../../../database/entities/geo-restriction.entity';

describe('UpdateGeoRestrictionDto', () => {
  async function validateDto(data: Record<string, unknown>) {
    const dto = plainToInstance(UpdateGeoRestrictionDto, data);
    return validate(dto);
  }

  it('should pass with valid blocklist mode', async () => {
    const errors = await validateDto({ mode: 'blocklist' });
    const modeErrors = errors.filter((e) => e.property === 'mode');
    expect(modeErrors.length).toBe(0);
  });

  it('should pass with valid allowlist mode', async () => {
    const errors = await validateDto({ mode: 'allowlist' });
    const modeErrors = errors.filter((e) => e.property === 'mode');
    expect(modeErrors.length).toBe(0);
  });

  it('should reject invalid mode value', async () => {
    const errors = await validateDto({ mode: 'invalid_mode' });
    const modeErrors = errors.filter((e) => e.property === 'mode');
    expect(modeErrors.length).toBeGreaterThan(0);
  });

  it('should pass with valid country codes', async () => {
    const errors = await validateDto({ countries: ['US', 'GB', 'DE'] });
    const countryErrors = errors.filter((e) => e.property === 'countries');
    expect(countryErrors.length).toBe(0);
  });

  it('should reject lowercase country codes', async () => {
    const errors = await validateDto({ countries: ['us', 'gb'] });
    const countryErrors = errors.filter((e) => e.property === 'countries');
    expect(countryErrors.length).toBeGreaterThan(0);
  });

  it('should reject 3-letter country codes', async () => {
    const errors = await validateDto({ countries: ['USA', 'GBR'] });
    const countryErrors = errors.filter((e) => e.property === 'countries');
    expect(countryErrors.length).toBeGreaterThan(0);
  });

  it('should pass with empty countries array', async () => {
    const errors = await validateDto({ countries: [] });
    const countryErrors = errors.filter((e) => e.property === 'countries');
    expect(countryErrors.length).toBe(0);
  });

  it('should pass with boolean isActive', async () => {
    const errors = await validateDto({ isActive: true });
    const activeErrors = errors.filter((e) => e.property === 'isActive');
    expect(activeErrors.length).toBe(0);
  });

  it('should pass with boolean logOnly', async () => {
    const errors = await validateDto({ logOnly: false });
    const logOnlyErrors = errors.filter((e) => e.property === 'logOnly');
    expect(logOnlyErrors.length).toBe(0);
  });

  it('should pass with all fields empty (all optional)', async () => {
    const errors = await validateDto({});
    expect(errors.length).toBe(0);
  });
});
