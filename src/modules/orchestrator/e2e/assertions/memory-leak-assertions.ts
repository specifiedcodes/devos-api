/**
 * Memory Leak Assertion Utilities
 * Story 11.10: End-to-End Pipeline Integration Test
 *
 * Functions for detecting memory leaks during pipeline E2E tests
 * by analyzing heap snapshots taken throughout execution.
 */

import {
  MemorySnapshot,
  MemoryLeakReport,
  DEFAULT_MEMORY_MAX_HEAP_GROWTH_MB,
} from '../e2e-pipeline.interfaces';

/**
 * Validates that heap growth does not exceed the configured threshold.
 *
 * @throws Error if heap growth exceeds maxGrowthMB
 */
export function assertNoMemoryLeak(
  snapshots: MemorySnapshot[],
  maxGrowthMB: number = DEFAULT_MEMORY_MAX_HEAP_GROWTH_MB,
): void {
  if (snapshots.length < 2) {
    return; // Not enough data to detect leaks
  }

  const initial = snapshots[0].heapUsed;
  const final = snapshots[snapshots.length - 1].heapUsed;
  const growthBytes = final - initial;
  const growthMB = growthBytes / (1024 * 1024);

  if (growthMB > maxGrowthMB) {
    throw new Error(
      `Memory leak detected: Heap grew by ${growthMB.toFixed(2)} MB ` +
        `(threshold: ${maxGrowthMB} MB). ` +
        `Initial: ${(initial / (1024 * 1024)).toFixed(2)} MB, ` +
        `Final: ${(final / (1024 * 1024)).toFixed(2)} MB`,
    );
  }
}

/**
 * Validates that heap usage does not monotonically increase for
 * 5 or more consecutive snapshots (indicating a potential leak
 * without GC reclaiming memory).
 *
 * @throws Error if monotonic growth detected over 5+ snapshots
 */
export function assertNoMonotonicGrowth(
  snapshots: MemorySnapshot[],
): void {
  if (snapshots.length < 5) {
    return; // Not enough data
  }

  let consecutiveIncreases = 0;

  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i].heapUsed > snapshots[i - 1].heapUsed) {
      consecutiveIncreases++;
    } else {
      consecutiveIncreases = 0;
    }

    if (consecutiveIncreases >= 5) {
      const startIdx = i - 5;
      const startMB = (snapshots[startIdx].heapUsed / (1024 * 1024)).toFixed(
        2,
      );
      const endMB = (snapshots[i].heapUsed / (1024 * 1024)).toFixed(2);
      throw new Error(
        `Potential memory leak: Heap monotonically increased for ` +
          `${consecutiveIncreases} consecutive snapshots ` +
          `(${startMB} MB -> ${endMB} MB between snapshots ${startIdx} and ${i}). ` +
          `Expected GC to reclaim some memory during this period.`,
      );
    }
  }
}

/**
 * Creates a comprehensive MemoryLeakReport from snapshots.
 */
export function createMemoryLeakReport(
  snapshots: MemorySnapshot[],
  maxGrowthMB: number = DEFAULT_MEMORY_MAX_HEAP_GROWTH_MB,
): MemoryLeakReport {
  if (snapshots.length === 0) {
    return {
      initialHeapUsed: 0,
      finalHeapUsed: 0,
      peakHeapUsed: 0,
      heapGrowthBytes: 0,
      leakDetected: false,
      snapshots: [],
    };
  }

  const initialHeapUsed = snapshots[0].heapUsed;
  const finalHeapUsed = snapshots[snapshots.length - 1].heapUsed;
  const peakHeapUsed = Math.max(...snapshots.map((s) => s.heapUsed));
  const heapGrowthBytes = finalHeapUsed - initialHeapUsed;
  const growthMB = heapGrowthBytes / (1024 * 1024);

  return {
    initialHeapUsed,
    finalHeapUsed,
    peakHeapUsed,
    heapGrowthBytes,
    leakDetected: growthMB > maxGrowthMB,
    snapshots,
  };
}
