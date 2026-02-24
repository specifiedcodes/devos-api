/**
 * Country Codes Constant Tests
 * Story 20-5: Geo-Restriction
 * Target: 3 tests covering validation of the country codes list
 */
import { COUNTRY_LIST } from '../constants/country-codes';

describe('COUNTRY_LIST Constant', () => {
  it('should have all entries with 2-character codes', () => {
    for (const entry of COUNTRY_LIST) {
      expect(entry.code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('should have all entries with non-empty names', () => {
    for (const entry of COUNTRY_LIST) {
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it('should have no duplicate country codes', () => {
    const codes = COUNTRY_LIST.map((c) => c.code);
    const uniqueCodes = new Set(codes);
    expect(codes.length).toBe(uniqueCodes.size);
  });
});
