/**
 * SessionHealthMonitor Tests
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * TDD: Tests written first, then implementation.
 * Tests session health monitoring with stall detection.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SessionHealthMonitorService } from './session-health-monitor.service';

describe('SessionHealthMonitorService', () => {
  let service: SessionHealthMonitorService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockSessionId = 'session-123';

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionHealthMonitorService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SessionHealthMonitorService>(
      SessionHealthMonitorService,
    );
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
  });

  afterEach(() => {
    jest.useRealTimers();
    service.onModuleDestroy();
  });

  describe('startMonitoring', () => {
    it('should set up heartbeat interval (30s)', () => {
      service.startMonitoring(mockSessionId);

      // Verify that after 30s, a health check occurs
      // (activity was just recorded at startMonitoring time, so should not be stalled yet)
      jest.advanceTimersByTime(30_000);

      // Should not emit stall event since we just started
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'cli:session:stalled',
        expect.anything(),
      );
    });
  });

  describe('recordActivity', () => {
    it('should update last activity timestamp', () => {
      service.startMonitoring(mockSessionId);

      // Advance time 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Record activity
      service.recordActivity(mockSessionId);

      // Advance another 5 minutes (total 10 from start, but only 5 from activity)
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Should NOT be stalled because activity was recorded
      expect(service.isStalled(mockSessionId)).toBe(false);
    });
  });

  describe('isStalled', () => {
    it('should return false when activity is recent', () => {
      service.startMonitoring(mockSessionId);

      // Just started, should not be stalled
      expect(service.isStalled(mockSessionId)).toBe(false);
    });

    it('should return true when no activity for 10+ minutes', () => {
      service.startMonitoring(mockSessionId);

      // Advance time past stall threshold (10 minutes)
      jest.advanceTimersByTime(10 * 60 * 1000 + 1);

      expect(service.isStalled(mockSessionId)).toBe(true);
    });

    it('should emit cli:session:stalled event when stall detected', () => {
      service.startMonitoring(mockSessionId);

      // Advance past stall threshold and trigger heartbeat check
      jest.advanceTimersByTime(10 * 60 * 1000 + 30_000);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cli:session:stalled',
        expect.objectContaining({
          sessionId: mockSessionId,
        }),
      );
    });

    it('should not emit duplicate stall events', () => {
      service.startMonitoring(mockSessionId);

      // Advance well past stall threshold
      jest.advanceTimersByTime(15 * 60 * 1000);

      const stallCalls = eventEmitter.emit.mock.calls.filter(
        (call) => call[0] === 'cli:session:stalled',
      );

      // Should only emit once, not on every heartbeat
      expect(stallCalls.length).toBe(1);
    });

    it('should return false for unknown session', () => {
      expect(service.isStalled('nonexistent')).toBe(false);
    });
  });

  describe('stopMonitoring', () => {
    it('should clear heartbeat interval', () => {
      service.startMonitoring(mockSessionId);
      service.stopMonitoring(mockSessionId);

      // Advance past stall threshold
      jest.advanceTimersByTime(15 * 60 * 1000);

      // Should not have emitted stall event since monitoring was stopped
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'cli:session:stalled',
        expect.anything(),
      );
    });

    it('should remove session from tracking', () => {
      service.startMonitoring(mockSessionId);
      service.stopMonitoring(mockSessionId);

      // isStalled should return false for removed session
      expect(service.isStalled(mockSessionId)).toBe(false);
    });
  });
});
