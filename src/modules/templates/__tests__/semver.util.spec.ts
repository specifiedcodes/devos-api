/**
 * Semver Utility Tests
 *
 * Story 19-7: Template Versioning
 */
import { SemverUtil, UpdateType } from '../utils/semver.util';

describe('SemverUtil', () => {
  describe('parse', () => {
    it('should parse a valid semver string', () => {
      expect(SemverUtil.parse('1.2.3')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
      });
    });

    it('should parse version with zeros', () => {
      expect(SemverUtil.parse('0.0.0')).toEqual({
        major: 0,
        minor: 0,
        patch: 0,
      });
    });

    it('should parse version with large numbers', () => {
      expect(SemverUtil.parse('100.200.300')).toEqual({
        major: 100,
        minor: 200,
        patch: 300,
      });
    });

    it('should return null for invalid format - missing patch', () => {
      expect(SemverUtil.parse('1.2')).toBeNull();
    });

    it('should return null for invalid format - too many parts', () => {
      expect(SemverUtil.parse('1.2.3.4')).toBeNull();
    });

    it('should return null for invalid format - letters', () => {
      expect(SemverUtil.parse('a.b.c')).toBeNull();
    });

    it('should return null for invalid format - pre-release', () => {
      expect(SemverUtil.parse('1.2.3-beta')).toBeNull();
    });

    it('should return null for invalid format - build metadata', () => {
      expect(SemverUtil.parse('1.2.3+build')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(SemverUtil.parse('')).toBeNull();
    });
  });

  describe('isValid', () => {
    it('should return true for valid semver', () => {
      expect(SemverUtil.isValid('1.0.0')).toBe(true);
      expect(SemverUtil.isValid('0.0.1')).toBe(true);
      expect(SemverUtil.isValid('10.20.30')).toBe(true);
    });

    it('should return false for invalid semver', () => {
      expect(SemverUtil.isValid('1.0')).toBe(false);
      expect(SemverUtil.isValid('v1.0.0')).toBe(false);
      expect(SemverUtil.isValid('1.0.0-beta')).toBe(false);
      expect(SemverUtil.isValid('')).toBe(false);
    });
  });

  describe('compare', () => {
    it('should return 0 for equal versions', () => {
      expect(SemverUtil.compare('1.0.0', '1.0.0')).toBe(0);
      expect(SemverUtil.compare('2.3.4', '2.3.4')).toBe(0);
    });

    it('should return -1 when first version is less', () => {
      expect(SemverUtil.compare('1.0.0', '2.0.0')).toBe(-1);
      expect(SemverUtil.compare('1.0.0', '1.1.0')).toBe(-1);
      expect(SemverUtil.compare('1.0.0', '1.0.1')).toBe(-1);
      expect(SemverUtil.compare('1.2.3', '1.2.4')).toBe(-1);
    });

    it('should return 1 when first version is greater', () => {
      expect(SemverUtil.compare('2.0.0', '1.0.0')).toBe(1);
      expect(SemverUtil.compare('1.1.0', '1.0.0')).toBe(1);
      expect(SemverUtil.compare('1.0.1', '1.0.0')).toBe(1);
      expect(SemverUtil.compare('1.2.4', '1.2.3')).toBe(1);
    });

    it('should compare major over minor over patch', () => {
      expect(SemverUtil.compare('2.0.0', '1.9.9')).toBe(1);
      expect(SemverUtil.compare('1.9.0', '1.8.9')).toBe(1);
      expect(SemverUtil.compare('1.0.9', '1.0.8')).toBe(1);
    });

    it('should throw error for invalid versions', () => {
      expect(() => SemverUtil.compare('invalid', '1.0.0')).toThrow('Invalid semver format');
      expect(() => SemverUtil.compare('1.0.0', 'invalid')).toThrow('Invalid semver format');
    });
  });

  describe('isGreater', () => {
    it('should return true when new version is greater', () => {
      expect(SemverUtil.isGreater('2.0.0', '1.0.0')).toBe(true);
      expect(SemverUtil.isGreater('1.1.0', '1.0.0')).toBe(true);
      expect(SemverUtil.isGreater('1.0.1', '1.0.0')).toBe(true);
    });

    it('should return false when new version is equal or less', () => {
      expect(SemverUtil.isGreater('1.0.0', '1.0.0')).toBe(false);
      expect(SemverUtil.isGreater('1.0.0', '2.0.0')).toBe(false);
      expect(SemverUtil.isGreater('1.0.0', '1.1.0')).toBe(false);
    });

    it('should return false for invalid versions', () => {
      expect(SemverUtil.isGreater('invalid', '1.0.0')).toBe(false);
      expect(SemverUtil.isGreater('1.0.0', 'invalid')).toBe(false);
    });
  });

  describe('isGreaterOrEqual', () => {
    it('should return true when new version is greater', () => {
      expect(SemverUtil.isGreaterOrEqual('2.0.0', '1.0.0')).toBe(true);
    });

    it('should return true when versions are equal', () => {
      expect(SemverUtil.isGreaterOrEqual('1.0.0', '1.0.0')).toBe(true);
    });

    it('should return false when new version is less', () => {
      expect(SemverUtil.isGreaterOrEqual('1.0.0', '2.0.0')).toBe(false);
    });
  });

  describe('getUpdateType', () => {
    it('should return "major" for major version increase', () => {
      expect(SemverUtil.getUpdateType('1.0.0', '2.0.0')).toBe('major');
      expect(SemverUtil.getUpdateType('1.5.5', '2.0.0')).toBe('major');
      expect(SemverUtil.getUpdateType('1.9.9', '2.0.0')).toBe('major');
    });

    it('should return "minor" for minor version increase', () => {
      expect(SemverUtil.getUpdateType('1.0.0', '1.1.0')).toBe('minor');
      expect(SemverUtil.getUpdateType('1.2.0', '1.3.0')).toBe('minor');
      expect(SemverUtil.getUpdateType('1.0.5', '1.1.0')).toBe('minor');
    });

    it('should return "patch" for patch version increase', () => {
      expect(SemverUtil.getUpdateType('1.0.0', '1.0.1')).toBe('patch');
      expect(SemverUtil.getUpdateType('1.2.3', '1.2.4')).toBe('patch');
      expect(SemverUtil.getUpdateType('2.0.0', '2.0.1')).toBe('patch');
    });

    it('should return null when not an update (same or lower version)', () => {
      expect(SemverUtil.getUpdateType('1.0.0', '1.0.0')).toBeNull();
      expect(SemverUtil.getUpdateType('2.0.0', '1.0.0')).toBeNull();
      expect(SemverUtil.getUpdateType('1.1.0', '1.0.5')).toBeNull();
    });

    it('should return null for invalid versions', () => {
      expect(SemverUtil.getUpdateType('invalid', '1.0.0')).toBeNull();
      expect(SemverUtil.getUpdateType('1.0.0', 'invalid')).toBeNull();
    });
  });

  describe('increment', () => {
    it('should increment patch version', () => {
      expect(SemverUtil.increment('1.0.0', 'patch')).toBe('1.0.1');
      expect(SemverUtil.increment('1.2.3', 'patch')).toBe('1.2.4');
    });

    it('should increment minor version and reset patch', () => {
      expect(SemverUtil.increment('1.0.0', 'minor')).toBe('1.1.0');
      expect(SemverUtil.increment('1.2.3', 'minor')).toBe('1.3.0');
    });

    it('should increment major version and reset minor and patch', () => {
      expect(SemverUtil.increment('1.0.0', 'major')).toBe('2.0.0');
      expect(SemverUtil.increment('1.2.3', 'major')).toBe('2.0.0');
    });

    it('should throw error for invalid version', () => {
      expect(() => SemverUtil.increment('invalid', 'patch')).toThrow('Invalid semver format');
    });
  });

  describe('nextPatch', () => {
    it('should return next patch version', () => {
      expect(SemverUtil.nextPatch('1.0.0')).toBe('1.0.1');
      expect(SemverUtil.nextPatch('2.3.4')).toBe('2.3.5');
    });
  });

  describe('nextMinor', () => {
    it('should return next minor version', () => {
      expect(SemverUtil.nextMinor('1.0.0')).toBe('1.1.0');
      expect(SemverUtil.nextMinor('2.3.4')).toBe('2.4.0');
    });
  });

  describe('nextMajor', () => {
    it('should return next major version', () => {
      expect(SemverUtil.nextMajor('1.0.0')).toBe('2.0.0');
      expect(SemverUtil.nextMajor('2.3.4')).toBe('3.0.0');
    });
  });

  describe('max', () => {
    it('should return the highest version', () => {
      expect(SemverUtil.max(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
      expect(SemverUtil.max(['1.0.0', '1.0.1', '1.0.2'])).toBe('1.0.2');
    });

    it('should handle single version', () => {
      expect(SemverUtil.max(['1.0.0'])).toBe('1.0.0');
    });

    it('should return null for empty array', () => {
      expect(SemverUtil.max([])).toBeNull();
    });

    it('should ignore invalid versions', () => {
      expect(SemverUtil.max(['1.0.0', 'invalid', '2.0.0'])).toBe('2.0.0');
    });

    it('should return null if all versions are invalid', () => {
      expect(SemverUtil.max(['invalid', 'bad'])).toBeNull();
    });
  });

  describe('sort', () => {
    it('should sort versions in ascending order', () => {
      expect(SemverUtil.sort(['2.0.0', '1.0.0', '1.1.0'])).toEqual([
        '1.0.0',
        '1.1.0',
        '2.0.0',
      ]);
    });

    it('should handle already sorted array', () => {
      expect(SemverUtil.sort(['1.0.0', '1.1.0', '2.0.0'])).toEqual([
        '1.0.0',
        '1.1.0',
        '2.0.0',
      ]);
    });

    it('should filter out invalid versions', () => {
      expect(SemverUtil.sort(['2.0.0', 'invalid', '1.0.0'])).toEqual(['1.0.0', '2.0.0']);
    });

    it('should return empty array for all invalid', () => {
      expect(SemverUtil.sort(['invalid', 'bad'])).toEqual([]);
    });
  });

  describe('sortDesc', () => {
    it('should sort versions in descending order', () => {
      expect(SemverUtil.sortDesc(['1.0.0', '2.0.0', '1.1.0'])).toEqual([
        '2.0.0',
        '1.1.0',
        '1.0.0',
      ]);
    });

    it('should return newest version first', () => {
      expect(SemverUtil.sortDesc(['1.0.0', '1.0.1', '1.0.2'])[0]).toBe('1.0.2');
    });
  });
});
