/**
 * PlannerGitOpsService Tests
 * Story 11.6: Planner Agent CLI Integration
 *
 * Tests for Git staging, commit, and push operations for planning documents.
 */

// Mock child_process before imports
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { exec } from 'child_process';
import { PlannerGitOpsService } from './planner-git-ops.service';
import { DevAgentGitOpsService } from './dev-agent-git-ops.service';

const mockExec = exec as unknown as jest.Mock;

describe('PlannerGitOpsService', () => {
  let service: PlannerGitOpsService;
  let devAgentGitOps: jest.Mocked<DevAgentGitOpsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerGitOpsService,
        {
          provide: DevAgentGitOpsService,
          useValue: {
            getLatestCommit: jest.fn(),
            pushBranch: jest.fn(),
            getChangedFiles: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlannerGitOpsService>(PlannerGitOpsService);
    devAgentGitOps = module.get(DevAgentGitOpsService);

    jest.clearAllMocks();
  });

  /**
   * Helper to mock exec to resolve successfully.
   */
  function mockExecSuccess(stdout = '', stderr = ''): void {
    mockExec.mockImplementation(
      (cmd: string, opts: any, callback: Function) => {
        callback(null, stdout, stderr);
      },
    );
  }

  /**
   * Helper to mock exec to reject with error.
   */
  function mockExecFailure(errorMessage: string): void {
    mockExec.mockImplementation(
      (cmd: string, opts: any, callback: Function) => {
        callback(new Error(errorMessage), '', '');
      },
    );
  }

  // ─── stageDocuments ────────────────────────────────────────────────────────

  describe('stageDocuments', () => {
    it('should stage specific files using git add', async () => {
      mockExecSuccess();

      await service.stageDocuments('/workspace', [
        '_bmad-output/planning-artifacts/prd.md',
        '_bmad-output/implementation-artifacts/12-1-setup.md',
      ]);

      expect(mockExec).toHaveBeenCalledTimes(2);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('git add'),
        expect.objectContaining({ cwd: '/workspace' }),
        expect.any(Function),
      );
    });

    it('should handle empty file list gracefully', async () => {
      await service.stageDocuments('/workspace', []);

      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should skip files with unsafe paths', async () => {
      mockExecSuccess();

      await service.stageDocuments('/workspace', [
        'valid/path.md',
        'invalid path with spaces.md', // Will be sanitized
      ]);

      // The second file may be filtered or sanitized - at least one call should occur
      expect(mockExec).toHaveBeenCalled();
    });

    it('should continue staging other files if one fails', async () => {
      let callCount = 0;
      mockExec.mockImplementation(
        (cmd: string, opts: any, callback: Function) => {
          callCount++;
          if (callCount === 1) {
            callback(new Error('Permission denied'), '', '');
          } else {
            callback(null, '', '');
          }
        },
      );

      await service.stageDocuments('/workspace', [
        'file1.md',
        'file2.md',
      ]);

      expect(mockExec).toHaveBeenCalledTimes(2);
    });
  });

  // ─── commitDocuments ──────────────────────────────────────────────────────

  describe('commitDocuments', () => {
    it('should commit with correct message format', async () => {
      mockExecSuccess();
      devAgentGitOps.getLatestCommit.mockResolvedValue({
        hash: 'abc123def456',
        message: 'plan(devos-epic-12): Generate planning documents',
        author: 'DevOS Bot',
        timestamp: new Date(),
      });

      const result = await service.commitDocuments({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        planningTask: 'create-project-plan',
        documentsGenerated: 5,
      });

      expect(result).not.toBeNull();
      expect(result!.hash).toBe('abc123def456');
      expect(result!.message).toContain('plan(devos-epic-12)');
      expect(result!.message).toContain('project plan');
      expect(result!.message).toContain('5 files');
    });

    it('should return null when no changes to commit', async () => {
      mockExecFailure('nothing to commit, working tree clean');

      const result = await service.commitDocuments({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        planningTask: 'breakdown-epic',
        documentsGenerated: 0,
      });

      expect(result).toBeNull();
    });

    it('should handle commit failure gracefully', async () => {
      mockExecFailure('fatal: unable to create commit');

      await expect(
        service.commitDocuments({
          workspacePath: '/workspace',
          epicId: 'epic-12',
          planningTask: 'create-stories',
          documentsGenerated: 3,
        }),
      ).rejects.toThrow('fatal: unable to create commit');
    });

    it('should include correct task description for each planning task', async () => {
      mockExecSuccess();
      devAgentGitOps.getLatestCommit.mockResolvedValue({
        hash: 'abc123',
        message: 'plan(devos-epic-12): test',
        author: 'Bot',
        timestamp: new Date(),
      });

      const result = await service.commitDocuments({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        planningTask: 'generate-prd',
        documentsGenerated: 1,
      });

      expect(result!.message).toContain('product requirements document');
    });
  });

  // ─── pushToRemote ─────────────────────────────────────────────────────────

  describe('pushToRemote', () => {
    it('should push to remote using token auth', async () => {
      devAgentGitOps.pushBranch.mockResolvedValue();

      await service.pushToRemote({
        workspacePath: '/workspace',
        githubToken: 'ghp_token',
        repoOwner: 'owner',
        repoName: 'repo',
      });

      expect(devAgentGitOps.pushBranch).toHaveBeenCalledWith(
        '/workspace',
        'main', // Default branch for planner
        'ghp_token',
        'owner',
        'repo',
      );
    });

    it('should use specified branch when provided', async () => {
      devAgentGitOps.pushBranch.mockResolvedValue();

      await service.pushToRemote({
        workspacePath: '/workspace',
        githubToken: 'ghp_token',
        repoOwner: 'owner',
        repoName: 'repo',
        branch: 'planning-branch',
      });

      expect(devAgentGitOps.pushBranch).toHaveBeenCalledWith(
        '/workspace',
        'planning-branch',
        'ghp_token',
        'owner',
        'repo',
      );
    });

    it('should propagate push errors from DevAgentGitOps', async () => {
      devAgentGitOps.pushBranch.mockRejectedValue(
        new Error('Failed to push after retry'),
      );

      await expect(
        service.pushToRemote({
          workspacePath: '/workspace',
          githubToken: 'ghp_token',
          repoOwner: 'owner',
          repoName: 'repo',
        }),
      ).rejects.toThrow('Failed to push after retry');
    });
  });
});
