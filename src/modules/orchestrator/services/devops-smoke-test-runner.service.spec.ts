/**
 * DevOpsSmokeTestRunnerService Tests
 * Story 11.7: DevOps Agent CLI Integration
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DevOpsSmokeTestRunnerService } from './devops-smoke-test-runner.service';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';

describe('DevOpsSmokeTestRunnerService', () => {
  let service: DevOpsSmokeTestRunnerService;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let outputStream: jest.Mocked<CLIOutputStreamService>;
  let healthMonitor: jest.Mocked<SessionHealthMonitorService>;
  let eventEmitter: EventEmitter2;

  const baseParams = {
    deploymentUrl: 'https://app.railway.app',
    workspacePath: '/tmp/workspace',
    workspaceId: 'ws-123',
    projectId: 'proj-456',
    storyTitle: 'Add user profile',
    environment: 'staging',
  };

  const sampleSuccessOutput = `Running smoke tests...

Testing health endpoint...
Health check passed: 200 OK

Testing API endpoints...
GET /api/users: 200 OK (150ms)

\`\`\`json
{
  "healthCheck": {
    "name": "Health Check",
    "url": "https://app.railway.app/api/health",
    "method": "GET",
    "expectedStatus": 200,
    "actualStatus": 200,
    "passed": true,
    "responseTimeMs": 120,
    "error": null
  },
  "apiChecks": [
    {
      "name": "Users API",
      "url": "https://app.railway.app/api/users",
      "method": "GET",
      "expectedStatus": 200,
      "actualStatus": 200,
      "passed": true,
      "responseTimeMs": 150,
      "error": null
    }
  ]
}
\`\`\``;

  const sampleFailedOutput = `Running smoke tests...

Testing health endpoint...
Health check FAILED: 503 Service Unavailable

\`\`\`json
{
  "healthCheck": {
    "name": "Health Check",
    "url": "https://app.railway.app/api/health",
    "method": "GET",
    "expectedStatus": 200,
    "actualStatus": 503,
    "passed": false,
    "responseTimeMs": 50,
    "error": "Service Unavailable"
  },
  "apiChecks": []
}
\`\`\``;

  const sampleAPIFailOutput = `\`\`\`json
{
  "healthCheck": {
    "name": "Health Check",
    "url": "https://app.railway.app/api/health",
    "method": "GET",
    "expectedStatus": 200,
    "actualStatus": 200,
    "passed": true,
    "responseTimeMs": 100,
    "error": null
  },
  "apiChecks": [
    {
      "name": "Users API",
      "url": "https://app.railway.app/api/users",
      "method": "GET",
      "expectedStatus": 200,
      "actualStatus": 500,
      "passed": false,
      "responseTimeMs": 200,
      "error": "Internal Server Error"
    }
  ]
}
\`\`\``;

  beforeEach(async () => {
    const realEventEmitter = new EventEmitter2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevOpsSmokeTestRunnerService,
        {
          provide: CLISessionLifecycleService,
          useValue: {
            spawnSession: jest.fn().mockResolvedValue({ sessionId: 'smoke-session-1' }),
          },
        },
        {
          provide: CLIOutputStreamService,
          useValue: {
            startStreaming: jest.fn(),
            stopStreaming: jest.fn().mockResolvedValue(undefined),
            getBufferedOutput: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SessionHealthMonitorService,
          useValue: {
            startMonitoring: jest.fn(),
            stopMonitoring: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: realEventEmitter,
        },
      ],
    }).compile();

    service = module.get<DevOpsSmokeTestRunnerService>(DevOpsSmokeTestRunnerService);
    lifecycleService = module.get(CLISessionLifecycleService) as jest.Mocked<CLISessionLifecycleService>;
    outputStream = module.get(CLIOutputStreamService) as jest.Mocked<CLIOutputStreamService>;
    healthMonitor = module.get(SessionHealthMonitorService) as jest.Mocked<SessionHealthMonitorService>;
    eventEmitter = module.get(EventEmitter2);
  });

  /**
   * Helper to simulate session completion after a brief delay.
   */
  function simulateCompletion(sessionId: string, exitCode = 0): void {
    setTimeout(() => {
      eventEmitter.emit('cli:session:completed', {
        sessionId,
        type: 'completed',
        timestamp: new Date(),
        metadata: { exitCode },
      });
    }, 10);
  }

  describe('runSmokeTests', () => {
    it('should spawn CLI session with smoke test prompt', async () => {
      simulateCompletion('smoke-session-1');
      outputStream.getBufferedOutput.mockResolvedValue(sampleSuccessOutput.split('\n'));

      await service.runSmokeTests(baseParams);

      expect(lifecycleService.spawnSession).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'devops',
          workspaceId: 'ws-123',
          projectId: 'proj-456',
        }),
      );
    });

    it('should extract smoke test results from CLI output', async () => {
      simulateCompletion('smoke-session-1');
      outputStream.getBufferedOutput.mockResolvedValue(sampleSuccessOutput.split('\n'));

      const result = await service.runSmokeTests(baseParams);

      expect(result.healthCheck.actualStatus).toBe(200);
      expect(result.apiChecks).toHaveLength(1);
      expect(result.apiChecks[0].name).toBe('Users API');
    });

    it('should return passed=true when all checks pass', async () => {
      simulateCompletion('smoke-session-1');
      outputStream.getBufferedOutput.mockResolvedValue(sampleSuccessOutput.split('\n'));

      const result = await service.runSmokeTests(baseParams);

      expect(result.passed).toBe(true);
      expect(result.passedChecks).toBe(2);
      expect(result.failedChecks).toBe(0);
    });

    it('should return passed=false when health check fails', async () => {
      simulateCompletion('smoke-session-1');
      outputStream.getBufferedOutput.mockResolvedValue(sampleFailedOutput.split('\n'));

      const result = await service.runSmokeTests(baseParams);

      expect(result.passed).toBe(false);
      expect(result.healthCheck.passed).toBe(false);
      expect(result.healthCheck.actualStatus).toBe(503);
    });

    it('should return passed=false when API checks fail', async () => {
      simulateCompletion('smoke-session-1');
      outputStream.getBufferedOutput.mockResolvedValue(sampleAPIFailOutput.split('\n'));

      const result = await service.runSmokeTests(baseParams);

      expect(result.passed).toBe(false);
      expect(result.healthCheck.passed).toBe(true);
      expect(result.apiChecks[0].passed).toBe(false);
      expect(result.failedChecks).toBe(1);
    });

    it('should handle CLI session failure gracefully', async () => {
      lifecycleService.spawnSession.mockRejectedValue(
        new Error('Failed to spawn session'),
      );

      const result = await service.runSmokeTests(baseParams);

      expect(result.passed).toBe(false);
      expect(result.details).toContain('Failed to spawn session');
    });

    it('should respect 5-minute timeout', async () => {
      // Don't simulate completion - let it timeout
      // Use a very short timeout for testing
      const shortTimeoutService = service as any;

      // Mock the waitForSessionCompletion to return timeout quickly
      setTimeout(() => {
        eventEmitter.emit('cli:session:failed', {
          sessionId: 'smoke-session-1',
          type: 'failed',
          timestamp: new Date(),
          metadata: { exitCode: null, error: 'Timeout' },
        });
      }, 10);

      outputStream.getBufferedOutput.mockResolvedValue(['No output']);

      const result = await service.runSmokeTests(baseParams);

      expect(result.passed).toBe(false);
    });

    it('should include health check as first smoke check', async () => {
      simulateCompletion('smoke-session-1');
      outputStream.getBufferedOutput.mockResolvedValue(sampleSuccessOutput.split('\n'));

      const result = await service.runSmokeTests(baseParams);

      expect(result.healthCheck).toBeDefined();
      expect(result.healthCheck.name).toBe('Health Check');
      expect(result.healthCheck.method).toBe('GET');
    });

    it('should start and stop streaming and monitoring', async () => {
      simulateCompletion('smoke-session-1');
      outputStream.getBufferedOutput.mockResolvedValue(sampleSuccessOutput.split('\n'));

      await service.runSmokeTests(baseParams);

      expect(outputStream.startStreaming).toHaveBeenCalled();
      expect(outputStream.stopStreaming).toHaveBeenCalledWith('smoke-session-1');
      expect(healthMonitor.startMonitoring).toHaveBeenCalledWith('smoke-session-1');
      expect(healthMonitor.stopMonitoring).toHaveBeenCalledWith('smoke-session-1');
    });

    it('should handle unparseable output gracefully', async () => {
      simulateCompletion('smoke-session-1');
      outputStream.getBufferedOutput.mockResolvedValue(
        ['Random output with no JSON block'],
      );

      const result = await service.runSmokeTests(baseParams);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toBe(1);
      expect(result.details).toContain('Could not parse');
    });
  });
});
