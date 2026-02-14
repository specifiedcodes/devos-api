/**
 * GitConfigService Tests
 * Story 11.2: Claude Code CLI Container Setup
 *
 * TDD: Tests written first, then implementation.
 * Tests Git configuration and authentication for CLI sessions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GitConfigService } from './git-config.service';
import * as child_process from 'child_process';

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
}));

describe('GitConfigService', () => {
  let service: GitConfigService;
  let configService: jest.Mocked<ConfigService>;

  const mockWorkspacePath = '/workspaces/ws-123/proj-456';
  const mockGithubToken = 'ghp_test-github-token-1234567890';
  const mockRepoUrl = 'https://github.com/test-org/test-repo.git';
  const mockAuthorName = 'DevOS Agent';
  const mockAuthorEmail = 'agent@devos.ai';

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          GIT_AUTHOR_NAME: mockAuthorName,
          GIT_AUTHOR_EMAIL: mockAuthorEmail,
        };
        return config[key] ?? defaultValue;
      }),
    };

    // Default mock for exec - success
    (child_process.exec as unknown as jest.Mock).mockImplementation(
      (cmd: string, opts: any, callback: Function) => {
        if (typeof opts === 'function') {
          opts(null, '', '');
        } else if (callback) {
          callback(null, '', '');
        }
        return { on: jest.fn() };
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitConfigService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<GitConfigService>(GitConfigService);
    configService = module.get(ConfigService);
  });

  describe('configureGitAuth', () => {
    it('should set up credential helper in workspace', async () => {
      await service.configureGitAuth(mockWorkspacePath, mockGithubToken);

      // Should call git config commands
      expect(child_process.exec).toHaveBeenCalled();
    });

    it('should not write token to disk', async () => {
      await service.configureGitAuth(mockWorkspacePath, mockGithubToken);

      // Check that no exec call writes the token to a file
      const allCalls = (child_process.exec as unknown as jest.Mock).mock.calls;
      for (const call of allCalls) {
        const command = call[0];
        // Command should not contain file write operations with the token
        expect(command).not.toMatch(/echo.*ghp_.*>/);
        expect(command).not.toMatch(/cat.*ghp_/);
      }
    });
  });

  describe('cloneRepository', () => {
    it('should clone repo with token-based HTTPS URL', async () => {
      await service.cloneRepository(
        mockRepoUrl,
        mockWorkspacePath,
        mockGithubToken,
      );

      const execCalls = (child_process.exec as unknown as jest.Mock).mock.calls;
      const cloneCall = execCalls.find((call: any[]) =>
        call[0].includes('git clone'),
      );

      expect(cloneCall).toBeDefined();
      // Should use token-embedded HTTPS URL
      expect(cloneCall[0]).toContain('x-access-token');
    });

    it('should support specific branch checkout', async () => {
      await service.cloneRepository(
        mockRepoUrl,
        mockWorkspacePath,
        mockGithubToken,
        'develop',
      );

      const execCalls = (child_process.exec as unknown as jest.Mock).mock.calls;
      const cloneCall = execCalls.find((call: any[]) =>
        call[0].includes('git clone'),
      );

      expect(cloneCall).toBeDefined();
      expect(cloneCall[0]).toContain('--branch "develop"');
    });

    it('should throw on clone failure', async () => {
      (child_process.exec as unknown as jest.Mock).mockImplementation(
        (cmd: string, opts: any, callback: Function) => {
          const cb = typeof opts === 'function' ? opts : callback;
          cb(new Error('Clone failed: authentication error'), '', 'fatal: authentication failed');
          return { on: jest.fn() };
        },
      );

      await expect(
        service.cloneRepository(
          mockRepoUrl,
          mockWorkspacePath,
          mockGithubToken,
        ),
      ).rejects.toThrow();
    });
  });

  describe('pullLatest', () => {
    it('should pull from remote origin', async () => {
      await service.pullLatest(mockWorkspacePath);

      const execCalls = (child_process.exec as unknown as jest.Mock).mock.calls;
      const pullCall = execCalls.find((call: any[]) =>
        call[0].includes('git pull') || call[0].includes('git fetch'),
      );

      expect(pullCall).toBeDefined();
    });

    it('should handle pull conflicts by throwing descriptive error', async () => {
      (child_process.exec as unknown as jest.Mock).mockImplementation(
        (cmd: string, opts: any, callback: Function) => {
          const cb = typeof opts === 'function' ? opts : callback;
          if (cmd.includes('git pull')) {
            cb(new Error('Pull failed: merge conflict'), '', 'CONFLICT (content)');
          } else {
            cb(null, '', '');
          }
          return { on: jest.fn() };
        },
      );

      await expect(service.pullLatest(mockWorkspacePath)).rejects.toThrow();
    });
  });

  describe('configureGitAuthor', () => {
    it('should set git user.name and user.email from environment', async () => {
      await service.configureGitAuthor(mockWorkspacePath);

      const execCalls = (child_process.exec as unknown as jest.Mock).mock.calls;
      const nameCalls = execCalls.filter((call: any[]) =>
        call[0].includes('git config user.name'),
      );
      const emailCalls = execCalls.filter((call: any[]) =>
        call[0].includes('git config user.email'),
      );

      expect(nameCalls.length).toBeGreaterThan(0);
      expect(emailCalls.length).toBeGreaterThan(0);

      // Verify the values
      expect(nameCalls[0][0]).toContain(mockAuthorName);
      expect(emailCalls[0][0]).toContain(mockAuthorEmail);
    });
  });
});
