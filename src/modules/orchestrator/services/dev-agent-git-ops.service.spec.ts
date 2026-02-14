/**
 * DevAgentGitOpsService Tests
 * Story 11.4: Dev Agent CLI Integration
 *
 * Tests for Git operations used by the Dev Agent pipeline.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DevAgentGitOpsService } from './dev-agent-git-ops.service';

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

import { exec } from 'child_process';

const execMock = exec as unknown as jest.Mock;

// Helper to simulate exec callback
function mockExecSuccess(stdout: string, stderr: string = '') {
  execMock.mockImplementation(
    (cmd: string, opts: any, callback: Function) => {
      callback(null, stdout, stderr);
    },
  );
}

function mockExecFailure(error: Error) {
  execMock.mockImplementation(
    (cmd: string, opts: any, callback: Function) => {
      callback(error, '', '');
    },
  );
}

function mockExecSequence(
  results: Array<{ stdout?: string; stderr?: string; error?: Error }>,
) {
  let callIndex = 0;
  execMock.mockImplementation(
    (cmd: string, opts: any, callback: Function) => {
      const result = results[callIndex] || results[results.length - 1];
      callIndex++;
      if (result.error) {
        callback(result.error, '', '');
      } else {
        callback(null, result.stdout || '', result.stderr || '');
      }
    },
  );
}

describe('DevAgentGitOpsService', () => {
  let service: DevAgentGitOpsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DevAgentGitOpsService],
    }).compile();

    service = module.get<DevAgentGitOpsService>(DevAgentGitOpsService);
    execMock.mockReset();
  });

  describe('getLatestCommit', () => {
    it('should return latest commit hash and message', async () => {
      const DELIM = '\x1e';
      mockExecSuccess(
        `abc123def${DELIM}feat(devos-11-4): add CLI integration${DELIM}DevOS Agent${DELIM}2026-02-15 10:00:00 +0000\n`,
      );

      const result = await service.getLatestCommit('/tmp/workspace');

      expect(result).not.toBeNull();
      expect(result!.hash).toBe('abc123def');
      expect(result!.message).toBe(
        'feat(devos-11-4): add CLI integration',
      );
      expect(result!.author).toBe('DevOS Agent');
      expect(result!.timestamp).toBeInstanceOf(Date);
    });

    it('should return null when no commits on branch', async () => {
      mockExecFailure(new Error('fatal: your current branch does not have any commits yet'));

      const result = await service.getLatestCommit('/tmp/workspace');

      expect(result).toBeNull();
    });

    it('should return null when git log output is empty', async () => {
      mockExecSuccess('');

      const result = await service.getLatestCommit('/tmp/workspace');

      expect(result).toBeNull();
    });

    it('should return null for malformed git log output', async () => {
      mockExecSuccess('malformed-output');

      const result = await service.getLatestCommit('/tmp/workspace');

      expect(result).toBeNull();
    });
  });

  describe('pushBranch', () => {
    it('should push branch with token-embedded URL', async () => {
      mockExecSuccess('');

      await service.pushBranch(
        '/tmp/workspace',
        'devos/dev/11-4',
        'ghp_test_token',
        'owner',
        'repo',
      );

      expect(execMock).toHaveBeenCalledTimes(1);
      const callArgs = execMock.mock.calls[0];
      expect(callArgs[0]).toContain('git push');
      expect(callArgs[0]).toContain('ghp_test_token');
      expect(callArgs[0]).toContain('owner');
      expect(callArgs[0]).toContain('repo');
    });

    it('should retry once on push rejection', async () => {
      mockExecSequence([
        { error: new Error('rejected') },
        { stdout: '' }, // pull --rebase succeeds
        { stdout: '' }, // second push succeeds
      ]);

      await service.pushBranch(
        '/tmp/workspace',
        'devos/dev/11-4',
        'ghp_test_token',
        'owner',
        'repo',
      );

      expect(execMock).toHaveBeenCalledTimes(3);
    });

    it('should throw on repeated push failure', async () => {
      mockExecSequence([
        { error: new Error('rejected') },
        { stdout: '' }, // pull --rebase succeeds
        { error: new Error('rejected again') }, // retry push fails
      ]);

      await expect(
        service.pushBranch(
          '/tmp/workspace',
          'devos/dev/11-4',
          'ghp_test_token',
          'owner',
          'repo',
        ),
      ).rejects.toThrow('Failed to push branch');
    });

    it('should not log the token in error messages', async () => {
      const token = 'ghp_secret_token_12345';
      mockExecSequence([
        { error: new Error(`rejected ${token}`) },
        { stdout: '' },
        { error: new Error(`failed again ${token}`) },
      ]);

      try {
        await service.pushBranch(
          '/tmp/workspace',
          'devos/dev/11-4',
          token,
          'owner',
          'repo',
        );
      } catch (error) {
        expect((error as Error).message).not.toContain(token);
        expect((error as Error).message).toContain('***');
      }
    });

    it('should validate branch name to prevent injection', async () => {
      await expect(
        service.pushBranch(
          '/tmp/workspace',
          'branch; rm -rf /',
          'token',
          'owner',
          'repo',
        ),
      ).rejects.toThrow('Invalid branchName');
    });

    it('should validate repoOwner to prevent injection', async () => {
      await expect(
        service.pushBranch(
          '/tmp/workspace',
          'devos/dev/11-4',
          'token',
          'owner; rm -rf /',
          'repo',
        ),
      ).rejects.toThrow('Invalid repoOwner');
    });

    it('should validate repoName to prevent injection', async () => {
      await expect(
        service.pushBranch(
          '/tmp/workspace',
          'devos/dev/11-4',
          'token',
          'owner',
          'repo; rm -rf /',
        ),
      ).rejects.toThrow('Invalid repoName');
    });
  });

  describe('getChangedFiles', () => {
    it('should return correct created/modified/deleted lists', async () => {
      mockExecSuccess(
        'A\tsrc/new-file.ts\nM\tsrc/existing-file.ts\nD\tsrc/removed-file.ts\n',
      );

      const result = await service.getChangedFiles(
        '/tmp/workspace',
        'devos/dev/11-4',
      );

      expect(result.created).toEqual(['src/new-file.ts']);
      expect(result.modified).toEqual(['src/existing-file.ts']);
      expect(result.deleted).toEqual(['src/removed-file.ts']);
    });

    it('should handle no changes (empty lists)', async () => {
      mockExecSuccess('');

      const result = await service.getChangedFiles(
        '/tmp/workspace',
        'devos/dev/11-4',
      );

      expect(result.created).toEqual([]);
      expect(result.modified).toEqual([]);
      expect(result.deleted).toEqual([]);
    });

    it('should handle renamed files as modified', async () => {
      mockExecSuccess('R100\tsrc/old-name.ts\tsrc/new-name.ts\n');

      const result = await service.getChangedFiles(
        '/tmp/workspace',
        'devos/dev/11-4',
      );

      expect(result.modified).toEqual(['src/new-name.ts']);
    });

    it('should handle multiple files of each type', async () => {
      mockExecSuccess(
        'A\tsrc/a.ts\nA\tsrc/b.ts\nM\tsrc/c.ts\nD\tsrc/d.ts\nD\tsrc/e.ts\n',
      );

      const result = await service.getChangedFiles(
        '/tmp/workspace',
        'devos/dev/11-4',
      );

      expect(result.created).toHaveLength(2);
      expect(result.modified).toHaveLength(1);
      expect(result.deleted).toHaveLength(2);
    });

    it('should use custom base branch', async () => {
      mockExecSuccess('');

      await service.getChangedFiles(
        '/tmp/workspace',
        'devos/dev/11-4',
        'develop',
      );

      const callArgs = execMock.mock.calls[0];
      expect(callArgs[0]).toContain('develop...devos/dev/11-4');
    });

    it('should return empty arrays on git diff failure', async () => {
      mockExecFailure(new Error('git diff failed'));

      const result = await service.getChangedFiles(
        '/tmp/workspace',
        'devos/dev/11-4',
      );

      expect(result.created).toEqual([]);
      expect(result.modified).toEqual([]);
      expect(result.deleted).toEqual([]);
    });

    it('should validate branch name', async () => {
      await expect(
        service.getChangedFiles(
          '/tmp/workspace',
          'branch; ls',
        ),
      ).rejects.toThrow('Invalid branchName');
    });
  });
});
