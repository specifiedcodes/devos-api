/**
 * PipelineBranchManager Tests
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * TDD: Tests written first, then implementation.
 * Tests Git branch management for pipeline agents.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PipelineBranchManagerService } from './pipeline-branch-manager.service';
import { GitConfigService } from './git-config.service';
import * as childProcess from 'child_process';

jest.mock('child_process');

describe('PipelineBranchManagerService', () => {
  let service: PipelineBranchManagerService;
  let gitConfigService: jest.Mocked<GitConfigService>;
  const mockedExec = childProcess.exec as unknown as jest.Mock;

  const mockWorkspacePath = '/workspaces/ws-123/proj-456';

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default exec mock: resolves with empty stdout
    mockedExec.mockImplementation(
      (
        _cmd: string,
        _opts: any,
        callback: (err: any, stdout: string, stderr: string) => void,
      ) => {
        callback(null, '', '');
        return {} as any;
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineBranchManagerService,
        {
          provide: GitConfigService,
          useValue: {
            pullLatest: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<PipelineBranchManagerService>(
      PipelineBranchManagerService,
    );
    gitConfigService = module.get(
      GitConfigService,
    ) as jest.Mocked<GitConfigService>;
  });

  describe('createFeatureBranch', () => {
    it('should create branch with correct naming pattern', async () => {
      // Branch does not exist locally
      mockedExec.mockImplementation(
        (
          cmd: string,
          _opts: any,
          callback: (err: any, stdout: string, stderr: string) => void,
        ) => {
          if (cmd.includes('git branch --list')) {
            callback(null, '', ''); // Branch does not exist
          } else if (cmd.includes('git checkout -b')) {
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
          return {} as any;
        },
      );

      const branchName = await service.createFeatureBranch({
        workspacePath: mockWorkspacePath,
        agentType: 'dev',
        storyId: '11-3',
      });

      expect(branchName).toBe('devos/dev/11-3');
    });

    it('should check out existing branch if already exists', async () => {
      // Branch exists locally
      mockedExec.mockImplementation(
        (
          cmd: string,
          _opts: any,
          callback: (err: any, stdout: string, stderr: string) => void,
        ) => {
          if (cmd.includes('git branch --list')) {
            callback(null, '  devos/dev/11-3\n', ''); // Branch exists
          } else if (cmd.includes('git checkout devos/dev/11-3')) {
            callback(null, '', '');
          } else if (cmd.includes('git pull')) {
            callback(null, '', ''); // Pull may fail silently for local-only branches
          } else {
            callback(null, '', '');
          }
          return {} as any;
        },
      );

      const branchName = await service.createFeatureBranch({
        workspacePath: mockWorkspacePath,
        agentType: 'dev',
        storyId: '11-3',
      });

      expect(branchName).toBe('devos/dev/11-3');
      // Should have called checkout, not checkout -b
      const checkoutCall = mockedExec.mock.calls.find(
        (call: any[]) =>
          call[0].includes('git checkout') &&
          !call[0].includes('-b') &&
          call[0].includes('devos/dev/11-3'),
      );
      expect(checkoutCall).toBeDefined();
    });

    it('should use main as default base branch', async () => {
      mockedExec.mockImplementation(
        (
          cmd: string,
          _opts: any,
          callback: (err: any, stdout: string, stderr: string) => void,
        ) => {
          if (cmd.includes('git branch --list')) {
            callback(null, '', '');
          } else {
            callback(null, '', '');
          }
          return {} as any;
        },
      );

      await service.createFeatureBranch({
        workspacePath: mockWorkspacePath,
        agentType: 'dev',
        storyId: '11-3',
      });

      // Should reference 'main' as base branch
      const createCall = mockedExec.mock.calls.find((call: any[]) =>
        call[0].includes('git checkout -b'),
      );
      expect(createCall).toBeDefined();
      expect(createCall![0]).toContain('main');
    });

    it('should return created branch name', async () => {
      mockedExec.mockImplementation(
        (
          cmd: string,
          _opts: any,
          callback: (err: any, stdout: string, stderr: string) => void,
        ) => {
          callback(null, '', '');
          return {} as any;
        },
      );

      const result = await service.createFeatureBranch({
        workspacePath: mockWorkspacePath,
        agentType: 'qa',
        storyId: '5-2',
      });

      expect(result).toBe('devos/qa/5-2');
    });

    it('should use custom base branch when provided', async () => {
      mockedExec.mockImplementation(
        (
          cmd: string,
          _opts: any,
          callback: (err: any, stdout: string, stderr: string) => void,
        ) => {
          callback(null, '', '');
          return {} as any;
        },
      );

      await service.createFeatureBranch({
        workspacePath: mockWorkspacePath,
        agentType: 'dev',
        storyId: '11-3',
        baseBranch: 'develop',
      });

      const createCall = mockedExec.mock.calls.find((call: any[]) =>
        call[0].includes('git checkout -b'),
      );
      expect(createCall).toBeDefined();
      expect(createCall![0]).toContain('develop');
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      mockedExec.mockImplementation(
        (
          cmd: string,
          _opts: any,
          callback: (err: any, stdout: string, stderr: string) => void,
        ) => {
          if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
            callback(null, 'devos/dev/11-3\n', '');
          } else {
            callback(null, '', '');
          }
          return {} as any;
        },
      );

      const branch = await service.getCurrentBranch(mockWorkspacePath);
      expect(branch).toBe('devos/dev/11-3');
    });
  });

  describe('branchExists', () => {
    it('should return true for existing local branch', async () => {
      mockedExec.mockImplementation(
        (
          cmd: string,
          _opts: any,
          callback: (err: any, stdout: string, stderr: string) => void,
        ) => {
          if (cmd.includes('git branch --list')) {
            callback(null, '  devos/dev/11-3\n', '');
          } else {
            callback(null, '', '');
          }
          return {} as any;
        },
      );

      const exists = await service.branchExists(
        mockWorkspacePath,
        'devos/dev/11-3',
      );
      expect(exists).toBe(true);
    });

    it('should return true for existing remote branch', async () => {
      mockedExec.mockImplementation(
        (
          cmd: string,
          _opts: any,
          callback: (err: any, stdout: string, stderr: string) => void,
        ) => {
          if (cmd.includes('git branch --list')) {
            callback(null, '', ''); // Not local
          } else if (cmd.includes('git ls-remote')) {
            callback(
              null,
              'abc123\trefs/heads/devos/dev/11-3\n',
              '',
            );
          } else {
            callback(null, '', '');
          }
          return {} as any;
        },
      );

      const exists = await service.branchExists(
        mockWorkspacePath,
        'devos/dev/11-3',
      );
      expect(exists).toBe(true);
    });

    it('should return false for non-existent branch', async () => {
      mockedExec.mockImplementation(
        (
          cmd: string,
          _opts: any,
          callback: (err: any, stdout: string, stderr: string) => void,
        ) => {
          callback(null, '', ''); // No output for both checks
          return {} as any;
        },
      );

      const exists = await service.branchExists(
        mockWorkspacePath,
        'devos/dev/nonexistent',
      );
      expect(exists).toBe(false);
    });
  });
});
