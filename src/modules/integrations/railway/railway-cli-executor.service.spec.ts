/**
 * RailwayCliExecutor Service Tests
 * Story 23-4: Railway CLI Executor Service
 *
 * TDD: Tests written first, then implementation.
 * Tests the CLI executor with: command allowlisting, credential isolation,
 * output streaming, output sanitization, timeout handling, error translation.
 *
 * 28 test cases across 6 categories.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';

// Mock child_process.spawn
const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

import {
  RailwayCliExecutor,
  RailwayCliOptions,
  RailwayCliResult,
} from './railway-cli-executor.service';

/**
 * Helper to create a mock child process that emits events.
 */
function createMockChildProcess(overrides?: Partial<ChildProcess>): {
  process: ChildProcess;
  stdout: EventEmitter;
  stderr: EventEmitter;
  processEmitter: EventEmitter;
} {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const processEmitter = new EventEmitter();

  const cp = Object.assign(processEmitter, {
    pid: 12345,
    stdout,
    stderr,
    stdin: null,
    stdio: [null, stdout, stderr] as any,
    connected: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: '',
    killed: false,
    kill: jest.fn().mockReturnValue(true),
    send: jest.fn(),
    disconnect: jest.fn(),
    unref: jest.fn(),
    ref: jest.fn(),
    [Symbol.dispose]: jest.fn(),
    ...overrides,
  }) as unknown as ChildProcess;

  return { process: cp, stdout, stderr, processEmitter };
}

describe('RailwayCliExecutor', () => {
  let service: RailwayCliExecutor;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: false });

    const module: TestingModule = await Test.createTestingModule({
      providers: [RailwayCliExecutor],
    }).compile();

    service = module.get<RailwayCliExecutor>(RailwayCliExecutor);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const defaultOptions: RailwayCliOptions = {
    command: 'whoami',
    railwayToken: 'test-railway-token-abc123',
  };

  // =========================================================================
  // 1. COMMAND ALLOWLIST TESTS (8 tests)
  // =========================================================================
  describe('Command Allowlist', () => {
    const allowedCommands = [
      'whoami', 'status', 'list', 'init', 'link', 'up', 'add',
      'redeploy', 'restart', 'down', 'domain', 'logs', 'variable',
      'environment', 'service', 'connect',
    ];

    it.each(allowedCommands)(
      'should accept allowed command: %s',
      async (command) => {
        const { process, stdout, stderr, processEmitter } = createMockChildProcess();
        mockSpawn.mockReturnValue(process);

        const resultPromise = service.execute({ ...defaultOptions, command });

        // Simulate successful exit
        processEmitter.emit('close', 0, null);
        const result = await resultPromise;

        expect(result.exitCode).toBe(0);
        expect(mockSpawn).toHaveBeenCalled();
      },
    );

    const deniedCommands = ['login', 'logout', 'open', 'delete', 'ssh', 'shell', 'run'];

    it.each(deniedCommands)(
      'should reject denied command: %s with ForbiddenException',
      async (command) => {
        await expect(
          service.execute({ ...defaultOptions, command }),
        ).rejects.toThrow(ForbiddenException);

        expect(mockSpawn).not.toHaveBeenCalled();
      },
    );

    it('should reject command injection attempts with semicolons', async () => {
      await expect(
        service.execute({ ...defaultOptions, command: 'whoami; rm -rf /' }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should reject command injection attempts with pipes', async () => {
      await expect(
        service.execute({ ...defaultOptions, command: 'status | cat /etc/passwd' }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should reject command injection attempts with backticks', async () => {
      await expect(
        service.execute({ ...defaultOptions, command: 'whoami `malicious`' }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should reject command injection attempts with $() syntax', async () => {
      await expect(
        service.execute({ ...defaultOptions, command: 'list $(rm -rf /)' }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should reject command injection attempts with && operator', async () => {
      await expect(
        service.execute({ ...defaultOptions, command: 'status && rm -rf /' }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should reject empty command', async () => {
      await expect(
        service.execute({ ...defaultOptions, command: '' }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. CREDENTIAL ISOLATION TESTS (4 tests)
  // =========================================================================
  describe('Credential Isolation', () => {
    it('should pass only sanitized env vars to child process', async () => {
      const { process, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(process);

      const resultPromise = service.execute(defaultOptions);
      processEmitter.emit('close', 0, null);
      await resultPromise;

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnOptions = spawnCall[2]; // third arg is options
      const env = spawnOptions.env;

      expect(Object.keys(env)).toHaveLength(4);
      expect(env).toHaveProperty('RAILWAY_TOKEN', defaultOptions.railwayToken);
      expect(env).toHaveProperty('HOME', '/tmp/railway-sandbox');
      expect(env).toHaveProperty('PATH', '/usr/local/bin:/usr/bin:/bin');
      expect(env).toHaveProperty('NODE_ENV', 'production');
    });

    it('should NOT include host environment variables like DATABASE_URL', async () => {
      // Set a host env var that should NOT leak
      const originalEnv = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://host:5432/db';

      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute(defaultOptions);
      processEmitter.emit('close', 0, null);
      await resultPromise;

      const spawnCall = mockSpawn.mock.calls[0];
      const env = spawnCall[2].env;

      expect(env).not.toHaveProperty('DATABASE_URL');
      expect(env).not.toHaveProperty('REDIS_URL');
      expect(env).not.toHaveProperty('JWT_SECRET');

      // Restore
      if (originalEnv !== undefined) {
        process.env.DATABASE_URL = originalEnv;
      } else {
        delete process.env.DATABASE_URL;
      }
    });

    it('should set HOME to /tmp/railway-sandbox', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute(defaultOptions);
      processEmitter.emit('close', 0, null);
      await resultPromise;

      const env = mockSpawn.mock.calls[0][2].env;
      expect(env.HOME).toBe('/tmp/railway-sandbox');
    });

    it('should inject the provided railway token into RAILWAY_TOKEN env var', async () => {
      const customToken = 'my-custom-railway-token-xyz789';
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        railwayToken: customToken,
      });
      processEmitter.emit('close', 0, null);
      await resultPromise;

      const env = mockSpawn.mock.calls[0][2].env;
      expect(env.RAILWAY_TOKEN).toBe(customToken);
    });
  });

  // =========================================================================
  // 3. OUTPUT SANITIZATION TESTS (6 tests)
  // =========================================================================
  describe('Output Sanitization', () => {
    it('should strip RAILWAY_TOKEN=... patterns from output', async () => {
      const { process: cp, stdout, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute(defaultOptions);

      stdout.emit('data', Buffer.from('Connecting with RAILWAY_TOKEN=sk_abc123_secret\n'));
      processEmitter.emit('close', 0, null);

      const result = await resultPromise;
      expect(result.stdout).not.toContain('sk_abc123_secret');
      expect(result.stdout).toContain('RAILWAY_TOKEN=***');
    });

    it('should strip Bearer token patterns from output', async () => {
      const { process: cp, stdout, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute(defaultOptions);

      stdout.emit('data', Buffer.from('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret\n'));
      processEmitter.emit('close', 0, null);

      const result = await resultPromise;
      expect(result.stdout).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(result.stdout).toContain('Bearer ***');
    });

    it('should mask PostgreSQL connection strings', async () => {
      const { process: cp, stdout, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute(defaultOptions);

      stdout.emit(
        'data',
        Buffer.from('DATABASE_URL=postgresql://user:pass@db.railway.internal:5432/app\n'),
      );
      processEmitter.emit('close', 0, null);

      const result = await resultPromise;
      expect(result.stdout).not.toContain('user:pass');
      expect(result.stdout).not.toContain('db.railway.internal');
      expect(result.stdout).toContain('postgresql://***:***@***');
    });

    it('should mask Redis connection strings', async () => {
      const { process: cp, stdout, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute(defaultOptions);

      stdout.emit(
        'data',
        Buffer.from('REDIS_URL=redis://default:secret@redis.railway.internal:6379\n'),
      );
      processEmitter.emit('close', 0, null);

      const result = await resultPromise;
      expect(result.stdout).not.toContain('default:secret');
      expect(result.stdout).not.toContain('redis.railway.internal');
      expect(result.stdout).toContain('redis://***:***@***');
    });

    it('should mask variable set KEY=VALUE to KEY=***', async () => {
      const { process: cp, stdout, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute(defaultOptions);

      stdout.emit(
        'data',
        Buffer.from('railway variable set SECRET_KEY=my-super-secret-value\n'),
      );
      processEmitter.emit('close', 0, null);

      const result = await resultPromise;
      expect(result.stdout).not.toContain('my-super-secret-value');
      expect(result.stdout).toContain('variable set SECRET_KEY=***');
    });

    it('should NOT sanitize safe URLs (deployment URLs are fine)', async () => {
      const { process: cp, stdout, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute(defaultOptions);

      const safeUrl = 'Deployed to https://myapp.up.railway.app\n';
      stdout.emit('data', Buffer.from(safeUrl));
      processEmitter.emit('close', 0, null);

      const result = await resultPromise;
      expect(result.stdout).toContain('https://myapp.up.railway.app');
    });
  });

  // =========================================================================
  // 4. TIMEOUT HANDLING TESTS (4 tests)
  // =========================================================================
  describe('Timeout Handling', () => {
    it('should use 600,000ms default timeout for deploy commands (up)', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'up',
      });

      // Advance time past 2 min (non-deploy) but before 10 min (deploy)
      jest.advanceTimersByTime(300_000); // 5 min
      // Process should NOT have been killed yet
      expect(cp.kill).not.toHaveBeenCalled();

      // Advance past 10 min
      jest.advanceTimersByTime(301_000); // total ~601s
      // Process should be killed with SIGTERM
      expect(cp.kill).toHaveBeenCalledWith('SIGTERM');

      processEmitter.emit('close', null, 'SIGTERM');
      const result = await resultPromise;
      expect(result.timedOut).toBe(true);
    });

    it('should use 120,000ms default timeout for non-deploy commands', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'status',
      });

      // Advance past 2 min
      jest.advanceTimersByTime(121_000);
      expect(cp.kill).toHaveBeenCalledWith('SIGTERM');

      processEmitter.emit('close', null, 'SIGTERM');
      const result = await resultPromise;
      expect(result.timedOut).toBe(true);
    });

    it('should use custom timeoutMs when provided', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'status',
        timeoutMs: 30_000,
      });

      // Should not be killed at 29s
      jest.advanceTimersByTime(29_000);
      expect(cp.kill).not.toHaveBeenCalled();

      // Should be killed at 31s
      jest.advanceTimersByTime(2_000);
      expect(cp.kill).toHaveBeenCalledWith('SIGTERM');

      processEmitter.emit('close', null, 'SIGTERM');
      const result = await resultPromise;
      expect(result.timedOut).toBe(true);
    });

    it('should set timedOut to false when process completes before timeout', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'whoami',
      });

      // Process completes quickly
      processEmitter.emit('close', 0, null);
      const result = await resultPromise;

      expect(result.timedOut).toBe(false);
      expect(cp.kill).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. OUTPUT STREAMING TESTS (3 tests)
  // =========================================================================
  describe('Output Streaming', () => {
    it('should call onOutput callback for stdout lines with stream type', async () => {
      const { process: cp, stdout, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const onOutput = jest.fn();
      const resultPromise = service.execute({
        ...defaultOptions,
        onOutput,
      });

      stdout.emit('data', Buffer.from('Hello from stdout\n'));
      processEmitter.emit('close', 0, null);

      await resultPromise;
      expect(onOutput).toHaveBeenCalledWith(
        expect.stringContaining('Hello from stdout'),
        'stdout',
      );
    });

    it('should call onOutput callback for stderr lines with stream type', async () => {
      const { process: cp, stderr, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const onOutput = jest.fn();
      const resultPromise = service.execute({
        ...defaultOptions,
        onOutput,
      });

      stderr.emit('data', Buffer.from('Warning from stderr\n'));
      processEmitter.emit('close', 0, null);

      await resultPromise;
      expect(onOutput).toHaveBeenCalledWith(
        expect.stringContaining('Warning from stderr'),
        'stderr',
      );
    });

    it('should call onOutput once per line for multi-line output', async () => {
      const { process: cp, stdout, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const onOutput = jest.fn();
      const resultPromise = service.execute({
        ...defaultOptions,
        onOutput,
      });

      stdout.emit('data', Buffer.from('Line 1\nLine 2\nLine 3\n'));
      processEmitter.emit('close', 0, null);

      await resultPromise;

      const stdoutCalls = onOutput.mock.calls.filter(
        (call: any) => call[1] === 'stdout',
      );
      expect(stdoutCalls.length).toBeGreaterThanOrEqual(3);
      expect(stdoutCalls[0][0]).toContain('Line 1');
      expect(stdoutCalls[1][0]).toContain('Line 2');
      expect(stdoutCalls[2][0]).toContain('Line 3');
    });
  });

  // =========================================================================
  // 6. EXIT CODE & ERROR HANDLING TESTS (3 tests)
  // =========================================================================
  describe('Exit Code & Error Handling', () => {
    it('should capture non-zero exit code without throwing', async () => {
      const { process: cp, stderr, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'status',
      });

      stderr.emit('data', Buffer.from('Error: not linked to a project\n'));
      processEmitter.emit('close', 1, null);

      const result = await resultPromise;
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not linked to a project');
    });

    it('should capture process crash with signal code', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'logs',
      });

      processEmitter.emit('close', null, 'SIGKILL');

      const result = await resultPromise;
      // When killed by signal, exit code is typically non-zero
      expect(result.exitCode).not.toBe(0);
    });

    it('should track durationMs accurately', async () => {
      jest.useRealTimers(); // Need real timers for this test

      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'whoami',
      });

      // Delay slightly before closing
      await new Promise((resolve) => setTimeout(resolve, 50));
      processEmitter.emit('close', 0, null);

      const result = await resultPromise;
      expect(result.durationMs).toBeGreaterThanOrEqual(40);
      expect(result.durationMs).toBeLessThan(500);

      jest.useFakeTimers({ advanceTimers: false });
    });

    it('should handle spawn error (e.g., invalid CLI path)', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'whoami',
      });

      // Emit error event (e.g., ENOENT)
      processEmitter.emit('error', new Error('spawn railway ENOENT'));
      processEmitter.emit('close', 1, null);

      const result = await resultPromise;
      expect(result.exitCode).not.toBe(0);
    });
  });

  // =========================================================================
  // 7. CLI ARGUMENT BUILDING TESTS (additional coverage)
  // =========================================================================
  describe('CLI Argument Building', () => {
    it('should build args with service flag when service option is provided', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'logs',
        service: 'my-api',
      });

      processEmitter.emit('close', 0, null);
      await resultPromise;

      const spawnArgs = mockSpawn.mock.calls[0][1]; // second arg is args array
      expect(spawnArgs).toContain('logs');
      expect(spawnArgs).toContain('-s');
      expect(spawnArgs).toContain('my-api');
    });

    it('should build args with environment flag when environment option is provided', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'up',
        environment: 'production',
      });

      processEmitter.emit('close', 0, null);
      await resultPromise;

      const spawnArgs = mockSpawn.mock.calls[0][1];
      expect(spawnArgs).toContain('up');
      expect(spawnArgs).toContain('-e');
      expect(spawnArgs).toContain('production');
    });

    it('should append additional args when provided', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'variable',
        args: ['list'],
      });

      processEmitter.emit('close', 0, null);
      await resultPromise;

      const spawnArgs = mockSpawn.mock.calls[0][1];
      expect(spawnArgs).toContain('variable');
      expect(spawnArgs).toContain('list');
    });

    it('should append additional flags when provided', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'up',
        flags: ['--detach', '-y'],
      });

      processEmitter.emit('close', 0, null);
      await resultPromise;

      const spawnArgs = mockSpawn.mock.calls[0][1];
      expect(spawnArgs).toContain('--detach');
      expect(spawnArgs).toContain('-y');
    });
  });

  // =========================================================================
  // 8. DEPLOY COMMAND DETECTION TESTS
  // =========================================================================
  describe('Deploy Command Detection', () => {
    it('should use deploy timeout for "redeploy" command', async () => {
      const { process: cp, processEmitter } = createMockChildProcess();
      mockSpawn.mockReturnValue(cp);

      const resultPromise = service.execute({
        ...defaultOptions,
        command: 'redeploy',
      });

      // At 3 min, non-deploy would have timed out, deploy should not
      jest.advanceTimersByTime(180_000);
      expect(cp.kill).not.toHaveBeenCalled();

      processEmitter.emit('close', 0, null);
      const result = await resultPromise;
      expect(result.timedOut).toBe(false);
    });
  });
});
