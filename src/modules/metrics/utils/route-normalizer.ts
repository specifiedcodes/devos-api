/**
 * Route Normalizer Utility
 * Story 14.1: Prometheus Metrics Exporter
 *
 * Normalizes route paths to prevent high-cardinality labels
 * from dynamic URL segments (UUIDs, numeric IDs).
 */

// UUID pattern: 8-4-4-4-12 hex characters
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Numeric-only path segments
const NUMERIC_ID_PATTERN = /\/\d+(?=\/|$)/g;

/**
 * Normalizes a route path by replacing dynamic segments with :id
 * @param route - The original route path
 * @returns Normalized route path
 */
export function normalizeRoute(route: string): string {
  if (!route) {
    return '/';
  }

  // Strip query string to prevent high-cardinality labels
  const pathOnly = route.split('?')[0];

  // Replace UUIDs with :id
  let normalized = pathOnly.replace(UUID_PATTERN, ':id');

  // Replace numeric-only path segments with :id
  normalized = normalized.replace(NUMERIC_ID_PATTERN, '/:id');

  return normalized;
}
