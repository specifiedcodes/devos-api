/**
 * WorkspaceManagerService Tests
 * Story 11.2: Claude Code CLI Container Setup
 *
 * TDD: Tests written first, then implementation.
 * Tests workspace directory management for agent CLI sessions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkspaceManagerService } from './workspace-manager.service';
import { GitConfigService } from './git-config.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn(),
  promises: {
    readdir: jest.fn(),
    stat: jest.fn(),
    rm: jest.fn(),
    unlink: jest.fn(),
    access: jest.fn(),
  },
}));

describe('WorkspaceManagerService', () => {
  let service: WorkspaceManagerService;
  let gitConfigService: jest.Mocked<GitConfigService>;
  let configService: jest.Mocked<ConfigService>;

  const mockBasePath = '/workspaces';
  const mockWorkspaceId = 'workspace-123';
  const mockProjectId = 'project-456';
  const mockGitRepoUrl = 'https://github.com/test/repo.git';
  const mockGitToken = 'ghp_test-token-123';
  const expectedPath = `${mockBasePath}/${mockWorkspaceId}/${mockProjectId}`;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockGitConfigService = {
      cloneRepository: jest.fn().mockResolvedValue(undefined),
      pullLatest: jest.fn().mockResolvedValue(undefined),
      configureGitAuth: jest.fn().mockResolvedValue(undefined),
      configureGitAuthor: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'CLI_WORKSPACE_BASE_PATH') return mockBasePath;
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceManagerService,
        { provide: GitConfigService, useValue: mockGitConfigService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WorkspaceManagerService>(WorkspaceManagerService);
    gitConfigService = module.get(GitConfigService);
    configService = module.get(ConfigService);
  });

  describe('prepareWorkspace', () => {
    it('should create workspace directory structure', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await service.prepareWorkspace(
        mockWorkspaceId,
        mockProjectId,
        mockGitRepoUrl,
        mockGitToken,
      );

      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath, {
        recursive: true,
      });
    });

    it('should clone repo on first call', async () => {
      // Directory does not exist, no .git
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(false) // directory check
        .mockReturnValueOnce(false); // .git check

      await service.prepareWorkspace(
        mockWorkspaceId,
        mockProjectId,
        mockGitRepoUrl,
        mockGitToken,
      );

      expect(gitConfigService.cloneRepository).toHaveBeenCalledWith(
        mockGitRepoUrl,
        expectedPath,
        mockGitToken,
        undefined,
      );
    });

    it('should pull latest on subsequent calls', async () => {
      // Directory exists, .git exists
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true) // directory check
        .mockReturnValueOnce(true); // .git check

      await service.prepareWorkspace(
        mockWorkspaceId,
        mockProjectId,
        mockGitRepoUrl,
        mockGitToken,
      );

      expect(gitConfigService.pullLatest).toHaveBeenCalledWith(
        expectedPath,
        undefined,
      );
      expect(gitConfigService.cloneRepository).not.toHaveBeenCalled();
    });

    it('should return correct workspace path', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await service.prepareWorkspace(
        mockWorkspaceId,
        mockProjectId,
        mockGitRepoUrl,
        mockGitToken,
      );

      expect(result).toBe(expectedPath);
    });
  });

  describe('cleanupWorkspace', () => {
    it('should remove .env and credential files', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: '.env', isFile: () => true, isDirectory: () => false },
        { name: '.env.local', isFile: () => true, isDirectory: () => false },
        { name: 'credentials.json', isFile: () => true, isDirectory: () => false },
        { name: 'server.key', isFile: () => true, isDirectory: () => false },
        { name: 'cert.pem', isFile: () => true, isDirectory: () => false },
        { name: 'index.ts', isFile: () => true, isDirectory: () => false },
        { name: '.git', isFile: () => false, isDirectory: () => true },
      ]);

      await service.cleanupWorkspace(mockWorkspaceId, mockProjectId);

      // Should remove sensitive files
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(expectedPath, '.env'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(expectedPath, '.env.local'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(expectedPath, 'credentials.json'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(expectedPath, 'server.key'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(expectedPath, 'cert.pem'));
    });

    it('should keep .git directory intact', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce([
          { name: '.git', isFile: () => false, isDirectory: () => true },
          { name: 'src', isFile: () => false, isDirectory: () => true },
        ])
        .mockReturnValueOnce([]); // src directory is empty

      await service.cleanupWorkspace(mockWorkspaceId, mockProjectId);

      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('should handle non-existent workspace gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      // Should not throw
      await expect(
        service.cleanupWorkspace(mockWorkspaceId, mockProjectId),
      ).resolves.not.toThrow();
    });
  });

  describe('destroyWorkspace', () => {
    it('should completely remove workspace directory', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await service.destroyWorkspace(mockWorkspaceId, mockProjectId);

      expect(fs.rmSync).toHaveBeenCalledWith(expectedPath, {
        recursive: true,
        force: true,
      });
    });
  });

  describe('getWorkspacePath', () => {
    it('should return correct path for workspace/project', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = service.getWorkspacePath(mockWorkspaceId, mockProjectId);

      expect(result).toBe(expectedPath);
    });

    it('should throw NotFoundException for non-existent workspace', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      expect(() =>
        service.getWorkspacePath(mockWorkspaceId, mockProjectId),
      ).toThrow(NotFoundException);
    });
  });

  describe('isWorkspaceReady', () => {
    it('should return true when .git exists', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true) // directory exists
        .mockReturnValueOnce(true); // .git exists

      const result = await service.isWorkspaceReady(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toBe(true);
    });

    it('should return false when directory is missing', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await service.isWorkspaceReady(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(result).toBe(false);
    });
  });

  describe('getWorkspaceSize', () => {
    it('should return disk usage in bytes', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // Mock recursive directory reading
      const mockEntries = [
        { name: 'file1.ts', isFile: () => true, isDirectory: () => false },
        { name: 'file2.ts', isFile: () => true, isDirectory: () => false },
      ];
      (fs.readdirSync as jest.Mock).mockReturnValue(mockEntries);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });

      const result = await service.getWorkspaceSize(
        mockWorkspaceId,
        mockProjectId,
      );

      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });
  });
});
