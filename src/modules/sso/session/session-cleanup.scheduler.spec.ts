import { Test, TestingModule } from '@nestjs/testing';
import { SessionCleanupScheduler } from './session-cleanup.scheduler';
import { SessionFederationService } from './session-federation.service';
import { SESSION_FEDERATION_CONSTANTS } from '../constants/session-federation.constants';

describe('SessionCleanupScheduler', () => {
  let scheduler: SessionCleanupScheduler;
  let mockSessionFederationService: jest.Mocked<Partial<SessionFederationService>>;

  beforeEach(async () => {
    mockSessionFederationService = {
      cleanupExpiredSessions: jest.fn().mockResolvedValue(0),
      purgeTerminatedSessions: jest.fn().mockResolvedValue(0),
      getSessionsNearExpiry: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionCleanupScheduler,
        {
          provide: SessionFederationService,
          useValue: mockSessionFederationService,
        },
      ],
    }).compile();

    scheduler = module.get<SessionCleanupScheduler>(SessionCleanupScheduler);
  });

  describe('handleExpiredSessionCleanup', () => {
    it('should call cleanupExpiredSessions', async () => {
      mockSessionFederationService.cleanupExpiredSessions!.mockResolvedValue(5);

      await scheduler.handleExpiredSessionCleanup();

      expect(mockSessionFederationService.cleanupExpiredSessions).toHaveBeenCalledTimes(1);
    });

    it('should log count when sessions cleaned up', async () => {
      mockSessionFederationService.cleanupExpiredSessions!.mockResolvedValue(3);

      await expect(scheduler.handleExpiredSessionCleanup()).resolves.not.toThrow();
    });

    it('should not throw on service error', async () => {
      mockSessionFederationService.cleanupExpiredSessions!.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(scheduler.handleExpiredSessionCleanup()).resolves.not.toThrow();
    });

    it('should handle zero cleaned up sessions silently', async () => {
      mockSessionFederationService.cleanupExpiredSessions!.mockResolvedValue(0);

      await expect(scheduler.handleExpiredSessionCleanup()).resolves.not.toThrow();
    });
  });

  describe('handleTerminatedSessionPurge', () => {
    it('should call purgeTerminatedSessions', async () => {
      mockSessionFederationService.purgeTerminatedSessions!.mockResolvedValue(10);

      await scheduler.handleTerminatedSessionPurge();

      expect(mockSessionFederationService.purgeTerminatedSessions).toHaveBeenCalledTimes(1);
    });

    it('should not throw on service error', async () => {
      mockSessionFederationService.purgeTerminatedSessions!.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(scheduler.handleTerminatedSessionPurge()).resolves.not.toThrow();
    });

    it('should handle zero purged sessions', async () => {
      mockSessionFederationService.purgeTerminatedSessions!.mockResolvedValue(0);

      await expect(scheduler.handleTerminatedSessionPurge()).resolves.not.toThrow();
    });
  });

  describe('handleSessionExpiryWarnings', () => {
    it('should call getSessionsNearExpiry with correct window', async () => {
      await scheduler.handleSessionExpiryWarnings();

      expect(mockSessionFederationService.getSessionsNearExpiry).toHaveBeenCalledWith(
        SESSION_FEDERATION_CONSTANTS.SESSION_EXPIRY_WARNING_MINUTES,
      );
    });

    it('should not throw on service error', async () => {
      mockSessionFederationService.getSessionsNearExpiry!.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(scheduler.handleSessionExpiryWarnings()).resolves.not.toThrow();
    });

    it('should handle sessions near expiry', async () => {
      mockSessionFederationService.getSessionsNearExpiry!.mockResolvedValue([
        { id: 's1' } as any,
        { id: 's2' } as any,
      ]);

      await expect(scheduler.handleSessionExpiryWarnings()).resolves.not.toThrow();
    });
  });
});
