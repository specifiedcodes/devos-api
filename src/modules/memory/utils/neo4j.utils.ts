/**
 * Neo4j Utility Functions
 * Story 12.1: Graphiti/Neo4j Setup
 *
 * Shared utilities for converting Neo4j driver types to plain JavaScript types.
 */

/**
 * Convert a Neo4j integer or JS number to a plain number.
 * Neo4j driver returns Integer objects for count/sum aggregations.
 */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

/**
 * Safely parse a JSON string, returning an empty object on failure.
 */
export function safeJsonParse(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/**
 * Parse a Neo4j datetime or ISO string to a JS Date.
 */
export function parseNeo4jTimestamp(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    return new Date(value);
  }
  // Neo4j DateTime object has toString()
  if (value && typeof value === 'object' && 'toString' in value) {
    return new Date((value as { toString: () => string }).toString());
  }
  return new Date();
}
