/**
 * Semver Utility
 *
 * Story 19-7: Template Versioning
 *
 * Provides semantic version comparison and validation utilities.
 * Supports standard semver format: major.minor.patch (e.g., 1.2.3)
 */
import { Injectable } from '@nestjs/common';

/**
 * Update type based on semver comparison
 */
export type UpdateType = 'patch' | 'minor' | 'major' | null;

/**
 * Parsed semver components
 */
export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
}

@Injectable()
export class SemverUtil {
  /**
   * Regex for validating semver format (major.minor.patch)
   * Does not support pre-release or build metadata for simplicity
   */
  private static readonly SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

  /**
   * Parse a version string into its components
   * @param version - Version string to parse
   * @returns Parsed components or null if invalid
   */
  static parse(version: string): ParsedSemver | null {
    const match = version.match(this.SEMVER_REGEX);
    if (!match) {
      return null;
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }

  /**
   * Check if a version string is valid semver
   * @param version - Version string to validate
   * @returns true if valid semver format
   */
  static isValid(version: string): boolean {
    return this.SEMVER_REGEX.test(version);
  }

  /**
   * Compare two version strings
   * @param v1 - First version
   * @param v2 - Second version
   * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  static compare(v1: string, v2: string): -1 | 0 | 1 {
    const parsed1 = this.parse(v1);
    const parsed2 = this.parse(v2);

    if (!parsed1 || !parsed2) {
      throw new Error('Invalid semver format');
    }

    // Compare major
    if (parsed1.major < parsed2.major) return -1;
    if (parsed1.major > parsed2.major) return 1;

    // Compare minor
    if (parsed1.minor < parsed2.minor) return -1;
    if (parsed1.minor > parsed2.minor) return 1;

    // Compare patch
    if (parsed1.patch < parsed2.patch) return -1;
    if (parsed1.patch > parsed2.patch) return 1;

    return 0;
  }

  /**
   * Check if newVersion is greater than existingVersion
   * @param newVersion - The new version to check
   * @param existingVersion - The existing version to compare against
   * @returns true if newVersion > existingVersion
   */
  static isGreater(newVersion: string, existingVersion: string): boolean {
    try {
      return this.compare(newVersion, existingVersion) === 1;
    } catch {
      return false;
    }
  }

  /**
   * Check if newVersion is greater than or equal to existingVersion
   * @param newVersion - The new version to check
   * @param existingVersion - The existing version to compare against
   * @returns true if newVersion >= existingVersion
   */
  static isGreaterOrEqual(newVersion: string, existingVersion: string): boolean {
    try {
      const result = this.compare(newVersion, existingVersion);
      return result === 1 || result === 0;
    } catch {
      return false;
    }
  }

  /**
   * Determine the type of update between two versions
   * @param from - Current/installed version
   * @param to - Target/newer version
   * @returns Update type or null if not an update
   */
  static getUpdateType(from: string, to: string): UpdateType {
    const parsedFrom = this.parse(from);
    const parsedTo = this.parse(to);

    if (!parsedFrom || !parsedTo) {
      return null;
    }

    // Check if it's actually an update
    if (this.compare(to, from) !== 1) {
      return null;
    }

    // Major update: x.*.*
    if (parsedTo.major > parsedFrom.major) {
      return 'major';
    }

    // Minor update: *.x.*
    if (parsedTo.minor > parsedFrom.minor) {
      return 'minor';
    }

    // Patch update: *.*.x
    if (parsedTo.patch > parsedFrom.patch) {
      return 'patch';
    }

    return null;
  }

  /**
   * Increment a version by the specified update type
   * @param version - Base version
   * @param type - Type of increment
   * @returns New version string
   */
  static increment(version: string, type: 'patch' | 'minor' | 'major'): string {
    const parsed = this.parse(version);
    if (!parsed) {
      throw new Error('Invalid semver format');
    }

    switch (type) {
      case 'major':
        return `${parsed.major + 1}.0.0`;
      case 'minor':
        return `${parsed.major}.${parsed.minor + 1}.0`;
      case 'patch':
        return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    }
  }

  /**
   * Get the next patch version
   * @param version - Current version
   * @returns Next patch version
   */
  static nextPatch(version: string): string {
    return this.increment(version, 'patch');
  }

  /**
   * Get the next minor version
   * @param version - Current version
   * @returns Next minor version
   */
  static nextMinor(version: string): string {
    return this.increment(version, 'minor');
  }

  /**
   * Get the next major version
   * @param version - Current version
   * @returns Next major version
   */
  static nextMajor(version: string): string {
    return this.increment(version, 'major');
  }

  /**
   * Find the maximum version from a list
   * @param versions - List of version strings
   * @returns Highest version or null if list is empty or all invalid
   */
  static max(versions: string[]): string | null {
    const validVersions = versions.filter((v) => this.isValid(v));
    if (validVersions.length === 0) {
      return null;
    }

    return validVersions.reduce((max, current) => {
      return this.isGreater(current, max) ? current : max;
    });
  }

  /**
   * Sort versions in ascending order
   * @param versions - List of version strings
   * @returns Sorted list
   */
  static sort(versions: string[]): string[] {
    return [...versions]
      .filter((v) => this.isValid(v))
      .sort((a, b) => this.compare(a, b));
  }

  /**
   * Sort versions in descending order
   * @param versions - List of version strings
   * @returns Sorted list (newest first)
   */
  static sortDesc(versions: string[]): string[] {
    return this.sort(versions).reverse();
  }
}
