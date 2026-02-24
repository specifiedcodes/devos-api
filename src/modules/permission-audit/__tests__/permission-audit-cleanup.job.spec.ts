/**
 * Tests for PermissionAuditCleanupJob
 * Story 20-6: Permission Audit Trail
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PermissionAuditCleanupJob } from '../jobs/permission-audit-cleanup.job';
import { PermissionAuditService } from '../services/permission-audit.service';

describe('PermissionAuditCleanupJob', () => {
  let job: PermissionAuditCleanupJob;
  const mockService = {
    cleanupExpiredEvents: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionAuditCleanupJob,
        { provide: PermissionAuditService, useValue: mockService },
      ],
    }).compile();
    job = module.get<PermissionAuditCleanupJob>(PermissionAuditCleanupJob);
  });

  it('should call cleanupExpiredEvents and log result', async () => {
    mockService.cleanupExpiredEvents.mockResolvedValueOnce(42);
    await job.handleCleanup();
    expect(mockService.cleanupExpiredEvents).toHaveBeenCalled();
  });

  it('should handle cleanup failure gracefully', async () => {
    mockService.cleanupExpiredEvents.mockRejectedValueOnce(new Error('DB down'));
    // Should NOT throw
    await expect(job.handleCleanup()).resolves.not.toThrow();
  });
});
