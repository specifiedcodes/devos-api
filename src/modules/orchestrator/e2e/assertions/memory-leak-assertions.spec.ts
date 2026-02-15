/**
 * Memory Leak Assertion Tests
 * Story 11.10: End-to-End Pipeline Integration Test
 */

import { MemorySnapshot } from '../e2e-pipeline.interfaces';
import {
  assertNoMemoryLeak,
  assertNoMonotonicGrowth,
  createMemoryLeakReport,
} from './memory-leak-assertions';

describe('Memory Leak Assertions', () => {
  function makeSnapshot(
    heapUsed: number,
    phase: string = 'test',
    offsetMs: number = 0,
  ): MemorySnapshot {
    return {
      timestamp: new Date(Date.now() + offsetMs),
      phase,
      heapUsed,
      heapTotal: heapUsed * 1.5,
      rss: heapUsed * 2,
      external: 1024 * 1024,
    };
  }

  const MB = 1024 * 1024;

  describe('assertNoMemoryLeak', () => {
    it('should pass when heap growth is within threshold', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'initial'),
        makeSnapshot(55 * MB, 'mid'),
        makeSnapshot(60 * MB, 'final'),
      ];

      expect(() =>
        assertNoMemoryLeak(snapshots, 50),
      ).not.toThrow();
    });

    it('should fail when heap growth exceeds threshold', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'initial'),
        makeSnapshot(150 * MB, 'final'),
      ];

      expect(() =>
        assertNoMemoryLeak(snapshots, 50),
      ).toThrow(/Memory leak detected/);
    });

    it('should include heap sizes in error message', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'initial'),
        makeSnapshot(200 * MB, 'final'),
      ];

      expect(() =>
        assertNoMemoryLeak(snapshots, 50),
      ).toThrow(/Initial.*Final/);
    });

    it('should pass with single snapshot (not enough data)', () => {
      const snapshots = [makeSnapshot(50 * MB)];

      expect(() =>
        assertNoMemoryLeak(snapshots, 50),
      ).not.toThrow();
    });

    it('should pass with empty snapshots', () => {
      expect(() =>
        assertNoMemoryLeak([], 50),
      ).not.toThrow();
    });
  });

  describe('assertNoMonotonicGrowth', () => {
    it('should pass when heap has normal fluctuations', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'p1', 0),
        makeSnapshot(52 * MB, 'p2', 1000),
        makeSnapshot(51 * MB, 'p3', 2000), // GC reclaim
        makeSnapshot(53 * MB, 'p4', 3000),
        makeSnapshot(52 * MB, 'p5', 4000), // GC reclaim
        makeSnapshot(54 * MB, 'p6', 5000),
      ];

      expect(() =>
        assertNoMonotonicGrowth(snapshots),
      ).not.toThrow();
    });

    it('should fail with 5+ consecutive increasing snapshots', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'p1', 0),
        makeSnapshot(51 * MB, 'p2', 1000),
        makeSnapshot(52 * MB, 'p3', 2000),
        makeSnapshot(53 * MB, 'p4', 3000),
        makeSnapshot(54 * MB, 'p5', 4000),
        makeSnapshot(55 * MB, 'p6', 5000),
      ];

      expect(() =>
        assertNoMonotonicGrowth(snapshots),
      ).toThrow(/monotonically increased/);
    });

    it('should pass with fewer than 5 snapshots', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'p1'),
        makeSnapshot(51 * MB, 'p2'),
        makeSnapshot(52 * MB, 'p3'),
      ];

      expect(() =>
        assertNoMonotonicGrowth(snapshots),
      ).not.toThrow();
    });

    it('should include snapshot range in error message', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'p1', 0),
        makeSnapshot(51 * MB, 'p2', 1000),
        makeSnapshot(52 * MB, 'p3', 2000),
        makeSnapshot(53 * MB, 'p4', 3000),
        makeSnapshot(54 * MB, 'p5', 4000),
        makeSnapshot(55 * MB, 'p6', 5000),
      ];

      expect(() =>
        assertNoMonotonicGrowth(snapshots),
      ).toThrow(/consecutive snapshots/);
    });
  });

  describe('createMemoryLeakReport', () => {
    it('should include correct initial, final, peak heap usage', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'initial'),
        makeSnapshot(80 * MB, 'peak'),
        makeSnapshot(60 * MB, 'final'),
      ];

      const report = createMemoryLeakReport(snapshots, 50);

      expect(report.initialHeapUsed).toBe(50 * MB);
      expect(report.finalHeapUsed).toBe(60 * MB);
      expect(report.peakHeapUsed).toBe(80 * MB);
      expect(report.heapGrowthBytes).toBe(10 * MB);
      expect(report.leakDetected).toBe(false);
    });

    it('should set leakDetected when growth exceeds threshold', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'initial'),
        makeSnapshot(150 * MB, 'final'),
      ];

      const report = createMemoryLeakReport(snapshots, 50);

      expect(report.leakDetected).toBe(true);
      expect(report.heapGrowthBytes).toBe(100 * MB);
    });

    it('should include all snapshots in report', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'initial'),
        makeSnapshot(55 * MB, 'mid'),
        makeSnapshot(60 * MB, 'final'),
      ];

      const report = createMemoryLeakReport(snapshots);

      expect(report.snapshots).toEqual(snapshots);
      expect(report.snapshots.length).toBe(3);
    });

    it('should handle empty snapshots', () => {
      const report = createMemoryLeakReport([]);

      expect(report.initialHeapUsed).toBe(0);
      expect(report.finalHeapUsed).toBe(0);
      expect(report.peakHeapUsed).toBe(0);
      expect(report.heapGrowthBytes).toBe(0);
      expect(report.leakDetected).toBe(false);
    });

    it('should include correct phase labels in snapshots', () => {
      const snapshots = [
        makeSnapshot(50 * MB, 'planning'),
        makeSnapshot(55 * MB, 'implementing'),
        makeSnapshot(60 * MB, 'qa'),
      ];

      const report = createMemoryLeakReport(snapshots);

      expect(report.snapshots[0].phase).toBe('planning');
      expect(report.snapshots[1].phase).toBe('implementing');
      expect(report.snapshots[2].phase).toBe('qa');
    });
  });
});
