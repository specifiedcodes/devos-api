import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GeoIP lookup service using MaxMind GeoLite2 database.
 *
 * Uses the maxmind npm package for IP-to-country resolution.
 * The GeoLite2-Country.mmdb database file is expected at:
 *   {project_root}/data/GeoLite2-Country.mmdb
 *
 * Fallback behavior:
 * - If database file not found, logs warning and returns null for all lookups (fail-open)
 * - If lookup fails for a specific IP, returns null (fail-open with logging)
 *
 * The database should be updated monthly via a cron job or CI pipeline
 * using MaxMind's geoipupdate tool.
 *
 * Key design decisions:
 * - Fail-open: If geo-detection fails, allow access (too risky to block on detection failure)
 * - Country-level only: No city/region granularity needed for compliance use cases
 * - In-memory reader: MaxMind Reader loads the DB into memory for fast lookups (~50MB)
 */
@Injectable()
export class GeoIpLookupService implements OnModuleInit {
  private readonly logger = new Logger(GeoIpLookupService.name);
  private reader: any = null;
  private isAvailable = false;

  private readonly DB_PATHS = [
    path.join(process.cwd(), 'data', 'GeoLite2-Country.mmdb'),
    path.join(process.cwd(), '..', 'data', 'GeoLite2-Country.mmdb'),
    '/usr/share/GeoIP/GeoLite2-Country.mmdb',
  ];

  async onModuleInit(): Promise<void> {
    await this.loadDatabase();
  }

  /**
   * Attempt to load the MaxMind GeoLite2 database.
   * Tries multiple known paths. If none found, service operates in
   * "unavailable" mode (all lookups return null).
   */
  async loadDatabase(): Promise<void> {
    try {
      // Dynamic import for maxmind package
      const maxmind = await import('maxmind');

      for (const dbPath of this.DB_PATHS) {
        if (fs.existsSync(dbPath)) {
          this.reader = await maxmind.open(dbPath);
          this.isAvailable = true;
          this.logger.log(`GeoIP database loaded from: ${dbPath}`);
          return;
        }
      }

      this.logger.warn(
        'GeoIP database not found. Geo-restriction will be unavailable. ' +
        'Expected at one of: ' + this.DB_PATHS.join(', '),
      );
    } catch (error) {
      this.logger.error('Failed to load GeoIP database', error);
    }
  }

  /**
   * Look up the country code for an IP address.
   *
   * @param ip - IPv4 or IPv6 address
   * @returns ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB') or null if unknown
   */
  lookup(ip: string): string | null {
    if (!this.isAvailable || !this.reader) {
      return null;
    }

    try {
      const result = this.reader.get(ip);
      if (result && result.country && result.country.iso_code) {
        return result.country.iso_code;
      }
      return null;
    } catch (error) {
      const sanitizedIp = ip.replace(/[^\d.:a-fA-F]/g, '').substring(0, 45);
      this.logger.warn(`GeoIP lookup failed for IP: ${sanitizedIp}`);
      return null;
    }
  }

  /**
   * Check if the GeoIP database is loaded and available.
   */
  isDatabaseAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Get database metadata (last build date, etc.) for admin display.
   */
  getDatabaseInfo(): { available: boolean; buildDate: string | null; type: string | null } {
    if (!this.isAvailable || !this.reader) {
      return { available: false, buildDate: null, type: null };
    }

    try {
      const metadata = this.reader.metadata;
      return {
        available: true,
        buildDate: metadata?.buildEpoch
          ? new Date(metadata.buildEpoch * 1000).toISOString()
          : null,
        type: metadata?.databaseType ?? null,
      };
    } catch {
      return { available: true, buildDate: null, type: null };
    }
  }
}
