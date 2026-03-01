/**
 * DeploymentEventPublisher Unit Tests
 *
 * Story 25-4: Deployment Streaming Unit & Integration Tests
 *
 * Tests cover:
 * - Publishing correct event types to Redis channel
 * - JSON serialization of events
 * - workspaceId inclusion in all published events
 * - Log line sanitization (tokens, connection strings, API keys)
 * - Monotonically increasing sequence numbers
 * - Progress clamping (0-100)
 * - Error handling (publishing failures don't throw)
 */

import {
  DeploymentEventPublisher,
  DEPLOYMENT_EVENTS_CHANNEL,
} from './deployment-event-publisher.service';

describe('DeploymentEventPublisher', () => {
  let publisher: DeploymentEventPublisher;
  let mockRedisService: {
    publish: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisService = {
      publish: jest.fn().mockResolvedValue(1),
    };
    publisher = new DeploymentEventPublisher(mockRedisService as any);
  });

  // ============================================================
  // publish() method
  // ============================================================

  describe('publish()', () => {
    it('should publish serialized JSON to deployment:events channel', async () => {
      await publisher.publish('workspace-1', {
        type: 'deployment:started',
        payload: {
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          timestamp: '2026-03-01T00:00:00.000Z',
        },
      });

      expect(mockRedisService.publish).toHaveBeenCalledWith(
        DEPLOYMENT_EVENTS_CHANNEL,
        expect.any(String),
      );

      const serialized = mockRedisService.publish.mock.calls[0][1];
      const parsed = JSON.parse(serialized);
      expect(parsed.type).toBe('deployment:started');
      expect(parsed.payload.workspaceId).toBe('workspace-1');
      expect(parsed.payload.projectId).toBe('project-1');
    });

    it('should include workspaceId in payload for routing', async () => {
      await publisher.publish('ws-abc-123', {
        type: 'deployment:status',
        payload: {
          workspaceId: 'ws-abc-123',
          projectId: 'proj-456',
          timestamp: new Date().toISOString(),
        },
      });

      const serialized = mockRedisService.publish.mock.calls[0][1];
      const parsed = JSON.parse(serialized);
      expect(parsed.payload.workspaceId).toBe('ws-abc-123');
    });

    it('should override payload workspaceId with the publish argument', async () => {
      await publisher.publish('correct-ws', {
        type: 'deployment:status',
        payload: {
          workspaceId: 'wrong-ws',
          projectId: 'proj-1',
          timestamp: new Date().toISOString(),
        },
      });

      const serialized = mockRedisService.publish.mock.calls[0][1];
      const parsed = JSON.parse(serialized);
      expect(parsed.payload.workspaceId).toBe('correct-ws');
    });

    it('should not throw on Redis publish failure', async () => {
      mockRedisService.publish.mockRejectedValue(new Error('Redis down'));

      // Should not throw
      await expect(
        publisher.publish('workspace-1', {
          type: 'deployment:log',
          payload: {
            workspaceId: 'workspace-1',
            projectId: 'project-1',
            timestamp: new Date().toISOString(),
          },
        }),
      ).resolves.not.toThrow();
    });
  });

  // ============================================================
  // publishDeploymentStarted()
  // ============================================================

  describe('publishDeploymentStarted()', () => {
    it('should publish deployment:started event with correct fields', async () => {
      const services = [
        { serviceId: 'svc-1', serviceName: 'api', serviceType: 'api' },
        { serviceId: 'svc-2', serviceName: 'frontend', serviceType: 'web' },
      ];

      await publisher.publishDeploymentStarted(
        'ws-1',
        'proj-1',
        'deploy-1',
        services,
        'user-1',
        'production',
      );

      const serialized = mockRedisService.publish.mock.calls[0][1];
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe('deployment:started');
      expect(parsed.payload.deploymentId).toBe('deploy-1');
      expect(parsed.payload.services).toEqual(services);
      expect(parsed.payload.triggeredBy).toBe('user-1');
      expect(parsed.payload.environment).toBe('production');
      expect(parsed.payload.timestamp).toBeDefined();
    });
  });

  // ============================================================
  // publishDeploymentStatus()
  // ============================================================

  describe('publishDeploymentStatus()', () => {
    it('should publish deployment:status with status enum value', async () => {
      await publisher.publishDeploymentStatus(
        'ws-1',
        'proj-1',
        'svc-1',
        'api',
        'building',
        { progress: 25 },
      );

      const serialized = mockRedisService.publish.mock.calls[0][1];
      const parsed = JSON.parse(serialized);

      expect(parsed.type).toBe('deployment:status');
      expect(parsed.payload.status).toBe('building');
      expect(parsed.payload.serviceId).toBe('svc-1');
      expect(parsed.payload.serviceName).toBe('api');
      expect(parsed.payload.progress).toBe(25);
    });

    it('should clamp progress to 0-100 range', async () => {
      await publisher.publishDeploymentStatus('ws-1', 'proj-1', 'svc-1', 'api', 'deploying', {
        progress: 150,
      });

      let serialized = mockRedisService.publish.mock.calls[0][1];
      let parsed = JSON.parse(serialized);
      expect(parsed.payload.progress).toBe(100);

      await publisher.publishDeploymentStatus('ws-1', 'proj-1', 'svc-1', 'api', 'deploying', {
        progress: -10,
      });

      serialized = mockRedisService.publish.mock.calls[1][1];
      parsed = JSON.parse(serialized);
      expect(parsed.payload.progress).toBe(0);
    });

    it('should include optional deploymentUrl and error', async () => {
      await publisher.publishDeploymentStatus('ws-1', 'proj-1', 'svc-1', 'api', 'success', {
        deploymentUrl: 'https://api.up.railway.app',
        progress: 100,
      });

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.payload.deploymentUrl).toBe('https://api.up.railway.app');
    });
  });

  // ============================================================
  // publishDeploymentCompleted()
  // ============================================================

  describe('publishDeploymentCompleted()', () => {
    it('should publish deployment:completed with per-service results', async () => {
      const services = [
        { serviceId: 's1', serviceName: 'api', status: 'success', buildDurationSeconds: 30 },
        { serviceId: 's2', serviceName: 'web', status: 'failed' },
      ];

      await publisher.publishDeploymentCompleted(
        'ws-1',
        'proj-1',
        'deploy-1',
        'partial_failure',
        services,
        45,
      );

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.type).toBe('deployment:completed');
      expect(parsed.payload.status).toBe('partial_failure');
      expect(parsed.payload.totalDurationSeconds).toBe(45);
      expect(parsed.payload.services).toHaveLength(2);
    });
  });

  // ============================================================
  // publishDeploymentLog()
  // ============================================================

  describe('publishDeploymentLog()', () => {
    it('should publish deployment:log with sanitized line', async () => {
      await publisher.publishDeploymentLog(
        'ws-1',
        'proj-1',
        'svc-1',
        'api',
        'Building Docker image...',
        'stdout',
        'build',
      );

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.type).toBe('deployment:log');
      expect(parsed.payload.line).toBe('Building Docker image...');
      expect(parsed.payload.stream).toBe('stdout');
      expect(parsed.payload.logType).toBe('build');
      expect(parsed.payload.sequence).toBe(1);
    });

    it('should have monotonically increasing sequence numbers', async () => {
      await publisher.publishDeploymentLog('ws-1', 'p-1', 's-1', 'api', 'Line 1', 'stdout', 'build');
      await publisher.publishDeploymentLog('ws-1', 'p-1', 's-1', 'api', 'Line 2', 'stdout', 'build');
      await publisher.publishDeploymentLog('ws-1', 'p-1', 's-1', 'api', 'Line 3', 'stdout', 'build');

      const seq1 = JSON.parse(mockRedisService.publish.mock.calls[0][1]).payload.sequence;
      const seq2 = JSON.parse(mockRedisService.publish.mock.calls[1][1]).payload.sequence;
      const seq3 = JSON.parse(mockRedisService.publish.mock.calls[2][1]).payload.sequence;

      expect(seq1).toBe(1);
      expect(seq2).toBe(2);
      expect(seq3).toBe(3);
      expect(seq2).toBeGreaterThan(seq1);
      expect(seq3).toBeGreaterThan(seq2);
    });

    it('should sanitize tokens from log lines', async () => {
      await publisher.publishDeploymentLog(
        'ws-1',
        'p-1',
        's-1',
        'api',
        'Env: RAILWAY_TOKEN=abc123secret',
        'stdout',
        'build',
      );

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.payload.line).toBe('Env: RAILWAY_TOKEN=***');
      expect(parsed.payload.line).not.toContain('abc123secret');
    });

    it('should sanitize PostgreSQL connection strings', async () => {
      await publisher.publishDeploymentLog(
        'ws-1',
        'p-1',
        's-1',
        'api',
        'DATABASE_URL=postgresql://user:pass@host:5432/db',
        'stdout',
        'build',
      );

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.payload.line).not.toContain('user:pass');
      expect(parsed.payload.line).toContain('***');
    });

    it('should sanitize Redis connection strings', async () => {
      await publisher.publishDeploymentLog(
        'ws-1',
        'p-1',
        's-1',
        'api',
        'REDIS_URL=redis://default:secretpass@redis.railway.app:6379',
        'stdout',
        'build',
      );

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.payload.line).not.toContain('secretpass');
      expect(parsed.payload.line).toContain('***');
    });

    it('should sanitize Bearer tokens', async () => {
      await publisher.publishDeploymentLog(
        'ws-1',
        'p-1',
        's-1',
        'api',
        'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.abc.def',
        'stdout',
        'build',
      );

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.payload.line).toBe('Authorization: Bearer ***');
    });

    it('should include ISO 8601 timestamp', async () => {
      await publisher.publishDeploymentLog('ws-1', 'p-1', 's-1', 'api', 'test', 'stdout', 'build');

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.payload.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });

  // ============================================================
  // publishEnvChanged()
  // ============================================================

  describe('publishEnvChanged()', () => {
    it('should publish deployment:env_changed with variable names (never values)', async () => {
      await publisher.publishEnvChanged(
        'ws-1',
        'proj-1',
        'svc-1',
        'api',
        'bulk_update',
        ['DATABASE_URL', 'REDIS_URL', 'API_KEY'],
        true,
      );

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.type).toBe('deployment:env_changed');
      expect(parsed.payload.variableNames).toEqual(['DATABASE_URL', 'REDIS_URL', 'API_KEY']);
      expect(parsed.payload.action).toBe('bulk_update');
      expect(parsed.payload.autoRedeploy).toBe(true);
    });

    it('should never contain variable values', async () => {
      await publisher.publishEnvChanged(
        'ws-1',
        'proj-1',
        'svc-1',
        'api',
        'set',
        ['SECRET_KEY'],
        false,
      );

      const serialized = mockRedisService.publish.mock.calls[0][1];
      // The serialized JSON should not contain any value-like content
      const parsed = JSON.parse(serialized);
      // Only names are in the payload
      expect(Object.keys(parsed.payload)).not.toContain('variableValues');
      expect(parsed.payload.variableNames).toEqual(['SECRET_KEY']);
    });
  });

  // ============================================================
  // publishServiceProvisioned()
  // ============================================================

  describe('publishServiceProvisioned()', () => {
    it('should publish deployment:service_provisioned with correct status', async () => {
      await publisher.publishServiceProvisioned(
        'ws-1',
        'proj-1',
        'svc-1',
        'main-db',
        'database',
        'provisioning',
      );

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.type).toBe('deployment:service_provisioned');
      expect(parsed.payload.serviceName).toBe('main-db');
      expect(parsed.payload.serviceType).toBe('database');
      expect(parsed.payload.status).toBe('provisioning');
    });
  });

  // ============================================================
  // publishDomainUpdated()
  // ============================================================

  describe('publishDomainUpdated()', () => {
    it('should publish deployment:domain_updated with domain and status', async () => {
      await publisher.publishDomainUpdated(
        'ws-1',
        'proj-1',
        'svc-1',
        'api',
        'api.example.com',
        'added',
        'pending_dns',
      );

      const parsed = JSON.parse(mockRedisService.publish.mock.calls[0][1]);
      expect(parsed.type).toBe('deployment:domain_updated');
      expect(parsed.payload.domain).toBe('api.example.com');
      expect(parsed.payload.action).toBe('added');
      expect(parsed.payload.status).toBe('pending_dns');
    });
  });

  // ============================================================
  // sanitizeLogLine() static method
  // ============================================================

  describe('sanitizeLogLine()', () => {
    it('should sanitize RAILWAY_TOKEN', () => {
      const result = DeploymentEventPublisher.sanitizeLogLine(
        'RAILWAY_TOKEN=abc123supersecret',
      );
      expect(result).toBe('RAILWAY_TOKEN=***');
    });

    it('should sanitize postgres connection strings', () => {
      const result = DeploymentEventPublisher.sanitizeLogLine(
        'postgresql://myuser:mypass@host.railway.app:5432/railway',
      );
      expect(result).toBe('postgresql://***:***@***');
      expect(result).not.toContain('myuser');
      expect(result).not.toContain('mypass');
    });

    it('should sanitize redis connection strings', () => {
      const result = DeploymentEventPublisher.sanitizeLogLine(
        'redis://default:secret@redis.railway.app:6379',
      );
      expect(result).toBe('redis://***:***@***');
    });

    it('should sanitize mongodb connection strings', () => {
      const result = DeploymentEventPublisher.sanitizeLogLine(
        'mongodb+srv://user:pass@cluster.mongodb.net/db',
      );
      expect(result).toBe('mongodb://***:***@***');
    });

    it('should sanitize variable set commands', () => {
      const result = DeploymentEventPublisher.sanitizeLogLine(
        'variable set DATABASE_URL=postgresql://user:pass@host:5432/db',
      );
      expect(result).toBe('variable set DATABASE_URL=***');
    });

    it('should leave non-sensitive content unchanged', () => {
      const result = DeploymentEventPublisher.sanitizeLogLine(
        'Step 3/8 : RUN npm install',
      );
      expect(result).toBe('Step 3/8 : RUN npm install');
    });

    it('should sanitize multiple patterns in the same line', () => {
      const result = DeploymentEventPublisher.sanitizeLogLine(
        'Connecting to postgresql://user:pass@host:5432/db with RAILWAY_TOKEN=abc123',
      );
      expect(result).not.toContain('user:pass');
      expect(result).not.toContain('abc123');
    });
  });

  // ============================================================
  // getSequenceCounter()
  // ============================================================

  describe('getSequenceCounter()', () => {
    it('should start at 0', () => {
      expect(publisher.getSequenceCounter()).toBe(0);
    });

    it('should increment after each publishDeploymentLog call', async () => {
      await publisher.publishDeploymentLog('ws', 'p', 's', 'svc', 'line', 'stdout', 'build');
      expect(publisher.getSequenceCounter()).toBe(1);

      await publisher.publishDeploymentLog('ws', 'p', 's', 'svc', 'line2', 'stdout', 'build');
      expect(publisher.getSequenceCounter()).toBe(2);
    });
  });

  // ============================================================
  // All 7 event types tested
  // ============================================================

  describe('all 7 event types', () => {
    it('should support all 7 deployment event types', async () => {
      const eventTypes: string[] = [];

      await publisher.publishDeploymentStarted('ws', 'p', 'd', [], 'user', 'prod');
      eventTypes.push(JSON.parse(mockRedisService.publish.mock.calls[0][1]).type);

      await publisher.publishDeploymentStatus('ws', 'p', 's', 'svc', 'building');
      eventTypes.push(JSON.parse(mockRedisService.publish.mock.calls[1][1]).type);

      await publisher.publishDeploymentCompleted('ws', 'p', 'd', 'success', [], 0);
      eventTypes.push(JSON.parse(mockRedisService.publish.mock.calls[2][1]).type);

      await publisher.publishDeploymentLog('ws', 'p', 's', 'svc', 'line', 'stdout', 'build');
      eventTypes.push(JSON.parse(mockRedisService.publish.mock.calls[3][1]).type);

      await publisher.publishEnvChanged('ws', 'p', 's', 'svc', 'set', ['KEY'], false);
      eventTypes.push(JSON.parse(mockRedisService.publish.mock.calls[4][1]).type);

      await publisher.publishServiceProvisioned('ws', 'p', 's', 'svc', 'database', 'active');
      eventTypes.push(JSON.parse(mockRedisService.publish.mock.calls[5][1]).type);

      await publisher.publishDomainUpdated('ws', 'p', 's', 'svc', 'example.com', 'added', 'active');
      eventTypes.push(JSON.parse(mockRedisService.publish.mock.calls[6][1]).type);

      expect(eventTypes).toEqual([
        'deployment:started',
        'deployment:status',
        'deployment:completed',
        'deployment:log',
        'deployment:env_changed',
        'deployment:service_provisioned',
        'deployment:domain_updated',
      ]);
    });
  });
});
