/**
 * SandboxToolExecutorService Tests
 *
 * Story 18-3: Agent Sandbox Testing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { SandboxToolExecutorService } from '../sandbox-tool-executor.service';
import { SandboxToolCallStatus } from '../../../database/entities/agent-sandbox-tool-call.entity';

describe('SandboxToolExecutorService', () => {
  let service: SandboxToolExecutorService;

  const mockSessionId = '44444444-4444-4444-4444-444444444444';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SandboxToolExecutorService],
    }).compile();

    service = module.get<SandboxToolExecutorService>(SandboxToolExecutorService);
  });

  describe('executeTool', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    describe('permission checking', () => {
      it('should deny tool not in allowed list', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'github',
          'read_files',
          {},
          { allowed: ['github:write_files'], denied: [] },
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(SandboxToolCallStatus.DENIED);
        expect(result.denialReason).toContain('not in allowed list');
      });

      it('should allow tool in allowed list', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'github',
          'read_files',
          { paths: ['test.ts'] },
          { allowed: ['github:read_files'], denied: [] },
        );

        expect(result.success).toBe(true);
        expect(result.status).toBe(SandboxToolCallStatus.SUCCESS);
      });

      it('should allow category wildcard', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'github',
          'read_files',
          { paths: ['test.ts'] },
          { allowed: ['github:*'], denied: [] },
        );

        expect(result.success).toBe(true);
      });

      it('should deny tool in denied list', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'github',
          'read_files',
          {},
          { allowed: [], denied: ['github:read_files'] },
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(SandboxToolCallStatus.DENIED);
      });

      it('should deny category wildcard', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'github',
          'read_files',
          {},
          { allowed: [], denied: ['github:*'] },
        );

        expect(result.success).toBe(false);
        expect(result.denialReason).toContain('denied');
      });

      it('should allow by default if no restrictions', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'github',
          'read_files',
          { paths: ['test.ts'] },
          {},
        );

        expect(result.success).toBe(true);
      });
    });

    describe('github tools', () => {
      it('should return mock files for read_files', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'github',
          'read_files',
          { paths: ['test.ts'] },
          {},
        );

        expect(result.success).toBe(true);
        expect(result.output).toBeDefined();
        expect(result.output!.files).toBeDefined();
      });

      it('should write to file system for write_files', async () => {
        const fileSystem = new Map<string, string>();
        const files = { 'test.ts': 'console.log("test");' };

        const result = await service.executeTool(
          mockSessionId,
          'github',
          'write_files',
          { files, message: 'Test commit' },
          {},
          fileSystem,
        );

        expect(result.success).toBe(true);
        expect(fileSystem.get('test.ts')).toBe('console.log("test");');
        expect(result.output!.filesWritten).toContain('test.ts');
      });

      it('should return mock PR for create_pr', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'github',
          'create_pr',
          { title: 'Test PR', body: 'Test body' },
          {},
        );

        expect(result.success).toBe(true);
        expect((result.output as any).pullRequest).toBeDefined();
        expect((result.output as any).pullRequest.title).toBe('Test PR');
        expect((result.output as any).pullRequest.html_url).toContain('github.com');
      });

      it('should list files from file system', async () => {
        const fileSystem = new Map<string, string>();
        fileSystem.set('src/index.ts', 'content');
        fileSystem.set('src/utils.ts', 'content');

        const result = await service.executeTool(
          mockSessionId,
          'github',
          'list_files',
          { path: '/' },
          {},
          fileSystem,
        );

        expect(result.success).toBe(true);
        expect((result.output as any).files.length).toBe(2);
      });
    });

    describe('deployment tools', () => {
      it('should return mock deployment for deploy_staging', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'deployment',
          'deploy_staging',
          { service: 'test-service' },
          {},
        );

        expect(result.success).toBe(true);
        expect((result.output as any).deployment).toBeDefined();
        expect((result.output as any).deployment.environment).toBe('staging');
        expect((result.output as any).deployment.note).toContain('sandbox');
      });

      it('should return mock deployment for deploy_production', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'deployment',
          'deploy_production',
          { service: 'test-service' },
          {},
        );

        expect(result.success).toBe(true);
        expect((result.output as any).deployment.environment).toBe('production');
        expect((result.output as any).deployment.note).toContain('sandbox');
      });

      it('should return mock status for deployment status', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'deployment',
          'status',
          { deploymentId: 'test-deploy' },
          {},
        );

        expect(result.success).toBe(true);
        expect(result.output!.status).toBeDefined();
      });
    });

    describe('database tools', () => {
      it('should return mock data for read_query', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'database',
          'read_query',
          { query: 'SELECT * FROM users' },
          {},
        );

        expect(result.success).toBe(true);
        expect(result.output!.rows).toBeDefined();
        expect(result.output!.rowCount).toBeGreaterThan(0);
      });

      it('should return mock result for write_query', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'database',
          'write_query',
          { query: 'INSERT INTO users VALUES (...)' },
          {},
        );

        expect(result.success).toBe(true);
        expect(result.output!.affectedRows).toBe(1);
      });
    });

    describe('filesystem tools', () => {
      it('should read file from file system', async () => {
        const fileSystem = new Map<string, string>();
        fileSystem.set('test.ts', 'file content');

        const result = await service.executeTool(
          mockSessionId,
          'filesystem',
          'read',
          { path: 'test.ts' },
          {},
          fileSystem,
        );

        expect(result.success).toBe(true);
        expect(result.output!.content).toBe('file content');
      });

      it('should return error for non-existent file', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'filesystem',
          'read',
          { path: 'nonexistent.ts' },
          {},
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(SandboxToolCallStatus.ERROR);
      });

      it('should write file to file system', async () => {
        const fileSystem = new Map<string, string>();

        const result = await service.executeTool(
          mockSessionId,
          'filesystem',
          'write',
          { path: 'test.ts', content: 'new content' },
          {},
          fileSystem,
        );

        expect(result.success).toBe(true);
        expect(fileSystem.get('test.ts')).toBe('new content');
      });

      it('should delete file from file system', async () => {
        const fileSystem = new Map<string, string>();
        fileSystem.set('test.ts', 'content');

        const result = await service.executeTool(
          mockSessionId,
          'filesystem',
          'delete',
          { path: 'test.ts' },
          {},
          fileSystem,
        );

        expect(result.success).toBe(true);
        expect(fileSystem.has('test.ts')).toBe(false);
      });

      it('should list files in directory', async () => {
        const fileSystem = new Map<string, string>();
        fileSystem.set('src/index.ts', 'content');
        fileSystem.set('src/utils.ts', 'content');

        const result = await service.executeTool(
          mockSessionId,
          'filesystem',
          'list',
          { path: '/' },
          {},
          fileSystem,
        );

        expect(result.success).toBe(true);
        expect((result.output as any).files.length).toBe(2);
      });
    });

    describe('command execution', () => {
      it('should allow safe commands', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'filesystem',
          'execute',
          { command: 'ls', args: ['-la'] },
          {},
        );

        expect(result.success).toBe(true);
        expect(result.output!.exitCode).toBe(0);
      });

      it('should deny dangerous commands', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'filesystem',
          'execute',
          { command: 'rm', args: ['-rf', '/'] },
          {},
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(SandboxToolCallStatus.DENIED);
      });

      it('should deny commands not in safe list', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'filesystem',
          'execute',
          { command: 'npm', args: ['install'] },
          {},
        );

        expect(result.success).toBe(false);
        expect(result.denialReason).toContain('not allowed');
      });

      it('should return error if command is missing', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'filesystem',
          'execute',
          {},
          {},
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(SandboxToolCallStatus.ERROR);
      });
    });

    describe('web tools', () => {
      it('should return mock response for fetch', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'web',
          'fetch',
          { url: 'https://example.com' },
          {},
        );

        expect(result.success).toBe(true);
        expect(result.output!.status).toBe(200);
        expect(result.output!.body).toBeDefined();
        expect(result.output!.note).toContain('sandbox');
      });

      it('should return mock response for request', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'web',
          'request',
          { url: 'https://api.example.com/data', method: 'POST' },
          {},
        );

        expect(result.success).toBe(true);
        expect(result.output!.method).toBe('POST');
      });

      it('should return error if URL is missing', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'web',
          'fetch',
          {},
          {},
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(SandboxToolCallStatus.ERROR);
      });
    });

    describe('generic tool handler', () => {
      it('should handle unknown tools with mock response', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'custom',
          'unknown_tool',
          { param: 'value' },
          {},
        );

        expect(result.success).toBe(true);
        expect(result.output!.note).toContain('sandbox');
        expect(result.output!.tool).toBe('custom:unknown_tool');
      });
    });

    describe('duration tracking', () => {
      it('should track execution duration', async () => {
        const result = await service.executeTool(
          mockSessionId,
          'github',
          'read_files',
          { paths: ['test.ts'] },
          {},
        );

        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
