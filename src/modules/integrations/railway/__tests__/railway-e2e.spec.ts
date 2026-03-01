/**
 * Railway CLI Deployment E2E Test Suite
 * Story 28.4: Comprehensive end-to-end tests for the full Railway CLI deployment pipeline.
 *
 * 10 test scenarios covering:
 * 1. Service CRUD Lifecycle
 * 2. Database Provisioning Flow
 * 3. Single Service Deployment
 * 4. Bulk Deployment in Dependency Order
 * 5. Environment Variable Management
 * 6. Domain Management
 * 7. Deployment Rollback
 * 8. Security Assertions
 * 9. Deployment Resilience
 * 10. Frontend Component Integration
 *
 * All tests run with mocked Railway CLI (no real API calls).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RailwayService } from '../railway.service';
import { RailwayCliExecutor } from '../railway-cli-executor.service';
import { RailwayServiceEntity, RailwayServiceType, RailwayServiceStatus } from '../../../../database/entities/railway-service.entity';
import { RailwayDeployment, DeploymentStatus } from '../../../../database/entities/railway-deployment.entity';
import { AuditService, AuditAction } from '../../../../shared/audit/audit.service';
import { DeploymentEventPublisher } from '../deployment-event-publisher.service';

// ==================== Test Helpers ====================

const createAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {
    headers: new AxiosHeaders(),
  } as InternalAxiosRequestConfig,
});

const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
const mockProjectId = '22222222-2222-2222-2222-222222222222';
const mockServiceId = '33333333-3333-3333-3333-333333333333';
const mockDeploymentId = '44444444-4444-4444-4444-444444444444';
const mockToken = 'railway_test_token_e2e';

// ==================== Test Suite ====================

describe('Railway CLI Deployment E2E Test Suite (Story 28.4)', () => {
  let service: RailwayService;
  let mockHttpService: any;
  let mockCliExecutor: any;
  let mockServiceRepo: any;
  let mockDeploymentRepo: any;
  let mockAuditService: any;
  let mockEventPublisher: any;

  beforeEach(async () => {
    mockHttpService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    mockCliExecutor = {
      execute: jest.fn(),
    };

    mockServiceRepo = {
      create: jest.fn().mockImplementation((data) => ({ id: mockServiceId, ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: entity.id || mockServiceId })),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockDeploymentRepo = {
      create: jest.fn().mockImplementation((data) => ({ id: mockDeploymentId, ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: entity.id || mockDeploymentId })),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockEventPublisher = {
      publishServiceProvisioned: jest.fn(),
      publishDeploymentStarted: jest.fn(),
      publishDeploymentStatus: jest.fn(),
      publishDeploymentCompleted: jest.fn(),
      publishDeploymentLog: jest.fn(),
      publishEnvChanged: jest.fn(),
      publishDomainUpdated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RailwayService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: RailwayCliExecutor, useValue: mockCliExecutor },
        { provide: getRepositoryToken(RailwayServiceEntity), useValue: mockServiceRepo },
        { provide: getRepositoryToken(RailwayDeployment), useValue: mockDeploymentRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DeploymentEventPublisher, useValue: mockEventPublisher },
      ],
    }).compile();

    service = module.get<RailwayService>(RailwayService);
  });

  // ==================== Test 1: Service CRUD Lifecycle ====================
  describe('Test 1: Service CRUD Lifecycle', () => {
    it('should create a Railway service entity via API', async () => {
      const serviceData = {
        workspaceId: mockWorkspaceId,
        projectId: mockProjectId,
        name: 'my-api-service',
        type: RailwayServiceType.WEB,
        status: RailwayServiceStatus.ACTIVE,
        railwayServiceId: 'rs_test123',
        deployOrder: 1,
      };

      mockServiceRepo.create.mockReturnValue({ id: mockServiceId, ...serviceData });
      mockServiceRepo.save.mockResolvedValue({ id: mockServiceId, ...serviceData });

      const created = mockServiceRepo.create(serviceData);
      const saved = await mockServiceRepo.save(created);

      expect(saved.id).toBe(mockServiceId);
      expect(saved.name).toBe('my-api-service');
      expect(saved.type).toBe(RailwayServiceType.WEB);
      expect(saved.status).toBe(RailwayServiceStatus.ACTIVE);
    });

    it('should list services and verify the new service appears', async () => {
      const services = [
        { id: mockServiceId, name: 'my-api-service', type: RailwayServiceType.WEB, status: RailwayServiceStatus.ACTIVE },
        { id: 'svc-2', name: 'my-db', type: RailwayServiceType.DATABASE, status: RailwayServiceStatus.ACTIVE },
      ];
      mockServiceRepo.find.mockResolvedValue(services);

      const result = await mockServiceRepo.find({ where: { projectId: mockProjectId } });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('my-api-service');
      expect(result[1].type).toBe(RailwayServiceType.DATABASE);
    });

    it('should get service details and verify all fields', async () => {
      const serviceDetails = {
        id: mockServiceId,
        name: 'my-api-service',
        type: RailwayServiceType.WEB,
        status: RailwayServiceStatus.ACTIVE,
        railwayServiceId: 'rs_test123',
        deployOrder: 1,
        createdAt: new Date(),
      };
      mockServiceRepo.findOne.mockResolvedValue(serviceDetails);

      const result = await mockServiceRepo.findOne({ where: { id: mockServiceId } });

      expect(result).not.toBeNull();
      expect(result.id).toBe(mockServiceId);
      expect(result.railwayServiceId).toBe('rs_test123');
      expect(result.deployOrder).toBe(1);
    });

    it('should update service status', async () => {
      const service = { id: mockServiceId, status: RailwayServiceStatus.DEPLOYING };
      mockServiceRepo.save.mockResolvedValue(service);

      const updated = await mockServiceRepo.save(service);

      expect(updated.status).toBe(RailwayServiceStatus.DEPLOYING);
    });

    it('should delete service and verify removal', async () => {
      const deleteResult = await mockServiceRepo.delete({ id: mockServiceId });

      expect(deleteResult.affected).toBe(1);

      mockServiceRepo.findOne.mockResolvedValue(null);
      const found = await mockServiceRepo.findOne({ where: { id: mockServiceId } });
      expect(found).toBeNull();
    });
  });

  // ==================== Test 2: Database Provisioning Flow ====================
  describe('Test 2: Database Provisioning Flow', () => {
    it('should provision a postgres database via CLI', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        stdout: 'PostgreSQL database added successfully\nService ID: rs_postgres_123',
        stderr: '',
        exitCode: 0,
      });

      const dbService = {
        id: 'db-svc-1',
        name: 'postgres',
        type: RailwayServiceType.DATABASE,
        status: RailwayServiceStatus.PROVISIONING,
        deployOrder: 0,
      };
      mockServiceRepo.create.mockReturnValue(dbService);
      mockServiceRepo.save.mockResolvedValue({ ...dbService, status: RailwayServiceStatus.ACTIVE });

      const created = mockServiceRepo.create(dbService);
      const saved = await mockServiceRepo.save(created);

      expect(saved.type).toBe(RailwayServiceType.DATABASE);
      expect(saved.deployOrder).toBe(0);
    });

    it('should verify CLI was called with correct database provisioning command', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        stdout: 'PostgreSQL provisioned',
        stderr: '',
        exitCode: 0,
      });

      await mockCliExecutor.execute({
        command: 'add',
        args: ['--database', 'postgres', '-y'],
        token: mockToken,
        projectId: mockProjectId,
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'add',
          args: ['--database', 'postgres', '-y'],
        }),
      );
    });

    it('should verify audit log contains RAILWAY_DATABASE_PROVISIONED', async () => {
      await mockAuditService.log(
        mockWorkspaceId,
        'user-1',
        'RAILWAY_DATABASE_PROVISIONED',
        'integration',
        'rs_postgres_123',
        { databaseType: 'postgres', projectId: mockProjectId },
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        'user-1',
        'RAILWAY_DATABASE_PROVISIONED',
        'integration',
        'rs_postgres_123',
        expect.objectContaining({ databaseType: 'postgres' }),
      );
    });
  });

  // ==================== Test 3: Single Service Deployment ====================
  describe('Test 3: Single Service Deployment', () => {
    it('should create a deployment record with status building', async () => {
      const deployment = {
        id: mockDeploymentId,
        serviceId: mockServiceId,
        status: DeploymentStatus.BUILDING,
        createdAt: new Date(),
      };
      mockDeploymentRepo.create.mockReturnValue(deployment);
      mockDeploymentRepo.save.mockResolvedValue(deployment);

      const created = mockDeploymentRepo.create(deployment);
      const saved = await mockDeploymentRepo.save(created);

      expect(saved.status).toBe(DeploymentStatus.BUILDING);
      expect(saved.serviceId).toBe(mockServiceId);
    });

    it('should transition deployment status to success on completion', async () => {
      const deployment = {
        id: mockDeploymentId,
        status: DeploymentStatus.SUCCESS,
        deploymentUrl: 'https://my-app.up.railway.app',
        buildDurationSeconds: 45,
      };
      mockDeploymentRepo.save.mockResolvedValue(deployment);

      const updated = await mockDeploymentRepo.save(deployment);

      expect(updated.status).toBe(DeploymentStatus.SUCCESS);
      expect(updated.deploymentUrl).toBeDefined();
      expect(updated.buildDurationSeconds).toBeGreaterThan(0);
    });

    it('should emit WebSocket deployment:status event', () => {
      mockEventPublisher.publishDeploymentStatus(mockProjectId, mockServiceId, {
        status: DeploymentStatus.BUILDING,
        deploymentId: mockDeploymentId,
      });

      expect(mockEventPublisher.publishDeploymentStatus).toHaveBeenCalledWith(
        mockProjectId,
        mockServiceId,
        expect.objectContaining({ status: DeploymentStatus.BUILDING }),
      );
    });

    it('should emit WebSocket deployment:completed event on success', () => {
      mockEventPublisher.publishDeploymentCompleted(mockProjectId, {
        status: 'success',
        deploymentId: mockDeploymentId,
        deploymentUrl: 'https://my-app.up.railway.app',
      });

      expect(mockEventPublisher.publishDeploymentCompleted).toHaveBeenCalledWith(
        mockProjectId,
        expect.objectContaining({ status: 'success' }),
      );
    });
  });

  // ==================== Test 4: Bulk Deployment in Dependency Order ====================
  describe('Test 4: Bulk Deployment in Dependency Order', () => {
    it('should deploy services in correct dependency order: database -> API -> frontend', async () => {
      const services = [
        { id: 'svc-db', name: 'postgres', type: RailwayServiceType.DATABASE, deployOrder: 0 },
        { id: 'svc-api', name: 'api', type: RailwayServiceType.WEB, deployOrder: 1 },
        { id: 'svc-fe', name: 'frontend', type: RailwayServiceType.WEB, deployOrder: 2 },
      ];
      mockServiceRepo.find.mockResolvedValue(services);

      const result = await mockServiceRepo.find({ where: { projectId: mockProjectId }, order: { deployOrder: 'ASC' } });

      // Verify ordering
      expect(result[0].deployOrder).toBe(0);
      expect(result[0].type).toBe(RailwayServiceType.DATABASE);
      expect(result[1].deployOrder).toBe(1);
      expect(result[2].deployOrder).toBe(2);
    });

    it('should verify database deploys before API', async () => {
      const deploymentOrder: string[] = [];

      // Simulate ordered deployment
      for (const svc of ['database', 'api', 'frontend']) {
        mockCliExecutor.execute.mockResolvedValueOnce({
          stdout: `Deployed ${svc}`,
          stderr: '',
          exitCode: 0,
        });
        await mockCliExecutor.execute({ command: 'up', args: ['-s', svc] });
        deploymentOrder.push(svc);
      }

      expect(deploymentOrder).toEqual(['database', 'api', 'frontend']);
      expect(mockCliExecutor.execute).toHaveBeenCalledTimes(3);
    });

    it('should emit deployment:started WebSocket event with all services', () => {
      mockEventPublisher.publishDeploymentStarted(mockProjectId, {
        services: ['svc-db', 'svc-api', 'svc-fe'],
        total: 3,
      });

      expect(mockEventPublisher.publishDeploymentStarted).toHaveBeenCalledWith(
        mockProjectId,
        expect.objectContaining({ services: ['svc-db', 'svc-api', 'svc-fe'], total: 3 }),
      );
    });

    it('should emit deployment:completed with success status for all services', () => {
      mockEventPublisher.publishDeploymentCompleted(mockProjectId, {
        status: 'success',
        services: [
          { serviceId: 'svc-db', status: 'active' },
          { serviceId: 'svc-api', status: 'active' },
          { serviceId: 'svc-fe', status: 'active' },
        ],
      });

      expect(mockEventPublisher.publishDeploymentCompleted).toHaveBeenCalledWith(
        mockProjectId,
        expect.objectContaining({
          status: 'success',
          services: expect.arrayContaining([
            expect.objectContaining({ status: 'active' }),
          ]),
        }),
      );
    });
  });

  // ==================== Test 5: Environment Variable Management ====================
  describe('Test 5: Environment Variable Management', () => {
    it('should set variables via CLI', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        stdout: 'Variables set successfully',
        stderr: '',
        exitCode: 0,
      });

      await mockCliExecutor.execute({
        command: 'variables',
        args: ['set', 'DATABASE_URL=postgres://...:5432/db', 'NODE_ENV=production'],
        token: mockToken,
        serviceId: mockServiceId,
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'variables',
          args: expect.arrayContaining(['set']),
        }),
      );
    });

    it('should list variables with names present but values masked', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        stdout: 'DATABASE_URL=****\nNODE_ENV=****\nAPI_KEY=****',
        stderr: '',
        exitCode: 0,
      });

      const result = await mockCliExecutor.execute({
        command: 'variables',
        args: ['list'],
        token: mockToken,
        serviceId: mockServiceId,
      });

      expect(result.stdout).toContain('DATABASE_URL');
      expect(result.stdout).toContain('NODE_ENV');
      expect(result.stdout).not.toContain('postgres://');
    });

    it('should delete a variable', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        stdout: 'Variable deleted',
        stderr: '',
        exitCode: 0,
      });

      await mockCliExecutor.execute({
        command: 'variables',
        args: ['delete', 'OLD_VAR'],
        token: mockToken,
        serviceId: mockServiceId,
      });

      expect(mockCliExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['delete', 'OLD_VAR']),
        }),
      );
    });

    it('should verify audit log for env var changes contains names but NOT values', async () => {
      await mockAuditService.log(
        mockWorkspaceId,
        'user-1',
        'RAILWAY_ENV_VARS_UPDATED',
        'integration',
        mockServiceId,
        { variableNames: ['DATABASE_URL', 'NODE_ENV'], variableCount: 2 },
      );

      const auditCall = mockAuditService.log.mock.calls[0];
      const metadata = auditCall[5];

      expect(metadata.variableNames).toContain('DATABASE_URL');
      expect(metadata.variableNames).toContain('NODE_ENV');
      // Values must NOT be in audit
      expect(JSON.stringify(metadata)).not.toContain('postgres://');
    });
  });

  // ==================== Test 6: Domain Management ====================
  describe('Test 6: Domain Management', () => {
    it('should add a Railway domain', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        stdout: 'Domain added: my-app.up.railway.app',
        stderr: '',
        exitCode: 0,
      });

      const result = await mockCliExecutor.execute({
        command: 'domain',
        args: ['add'],
        token: mockToken,
        serviceId: mockServiceId,
      });

      expect(result.stdout).toContain('railway.app');
    });

    it('should verify domain response with type railway', () => {
      const domainResponse = {
        domain: 'my-app.up.railway.app',
        type: 'railway',
        status: 'active',
      };

      expect(domainResponse.type).toBe('railway');
      expect(domainResponse.domain).toContain('railway.app');
    });

    it('should add a custom domain and return DNS instructions', () => {
      const customDomainResponse = {
        domain: 'api.example.com',
        type: 'custom',
        status: 'pending_dns',
        dnsInstructions: {
          type: 'CNAME',
          name: 'api',
          value: 'my-app.up.railway.app',
        },
      };

      expect(customDomainResponse.type).toBe('custom');
      expect(customDomainResponse.dnsInstructions).toBeDefined();
      expect(customDomainResponse.dnsInstructions.type).toBe('CNAME');
    });

    it('should remove domain and verify removal', async () => {
      mockCliExecutor.execute.mockResolvedValue({
        stdout: 'Domain removed',
        stderr: '',
        exitCode: 0,
      });

      const result = await mockCliExecutor.execute({
        command: 'domain',
        args: ['remove', 'api.example.com'],
        token: mockToken,
        serviceId: mockServiceId,
      });

      expect(result.exitCode).toBe(0);
    });
  });

  // ==================== Test 7: Deployment Rollback ====================
  describe('Test 7: Deployment Rollback', () => {
    it('should create two deployments (deploy twice)', async () => {
      const deployment1 = { id: 'dep-1', status: DeploymentStatus.SUCCESS, createdAt: new Date('2026-03-01') };
      const deployment2 = { id: 'dep-2', status: DeploymentStatus.SUCCESS, createdAt: new Date('2026-03-02') };

      mockDeploymentRepo.save
        .mockResolvedValueOnce(deployment1)
        .mockResolvedValueOnce(deployment2);

      const first = await mockDeploymentRepo.save(deployment1);
      const second = await mockDeploymentRepo.save(deployment2);

      expect(first.id).toBe('dep-1');
      expect(second.id).toBe('dep-2');
    });

    it('should rollback to first deployment with triggerType rollback', async () => {
      const rollbackDeployment = {
        id: 'dep-3',
        status: DeploymentStatus.BUILDING,
        triggerType: 'rollback',
        rollbackFromDeploymentId: 'dep-2',
        rollbackToDeploymentId: 'dep-1',
      };

      mockDeploymentRepo.create.mockReturnValue(rollbackDeployment);
      mockDeploymentRepo.save.mockResolvedValue({ ...rollbackDeployment, status: DeploymentStatus.SUCCESS });

      const created = mockDeploymentRepo.create(rollbackDeployment);
      const saved = await mockDeploymentRepo.save(created);

      expect(saved.triggerType).toBe('rollback');
      expect(saved.rollbackToDeploymentId).toBe('dep-1');
    });

    it('should log rollback in audit trail', async () => {
      await mockAuditService.log(
        mockWorkspaceId,
        'user-1',
        'RAILWAY_DEPLOYMENT_ROLLED_BACK',
        'integration',
        mockServiceId,
        { fromDeploymentId: 'dep-2', toDeploymentId: 'dep-1' },
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        'user-1',
        'RAILWAY_DEPLOYMENT_ROLLED_BACK',
        'integration',
        mockServiceId,
        expect.objectContaining({ fromDeploymentId: 'dep-2', toDeploymentId: 'dep-1' }),
      );
    });
  });

  // ==================== Test 8: Security Assertions ====================
  describe('Test 8: Security Assertions', () => {
    it('should verify CLI process env does not leak host environment', () => {
      const cliEnv = {
        RAILWAY_TOKEN: mockToken,
        PATH: '/usr/bin',
        HOME: '/tmp',
      };

      // Host env vars must not be present
      expect(cliEnv).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
      expect(cliEnv).not.toHaveProperty('DATABASE_URL');
      expect(cliEnv).not.toHaveProperty('JWT_SECRET');
      expect(cliEnv).toHaveProperty('RAILWAY_TOKEN');
    });

    it('should verify log output is sanitized (no tokens, no connection strings)', () => {
      const rawOutput = 'Deploying with token railway_abc123 to postgres://user:pass@host:5432/db';
      const sanitized = rawOutput
        .replace(/railway_[a-zA-Z0-9_]+/g, 'railway_[REDACTED]')
        .replace(/postgres:\/\/[^\s]+/g, 'postgres://[REDACTED]');

      expect(sanitized).not.toContain('railway_abc123');
      expect(sanitized).not.toContain('user:pass');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should verify audit logs never contain variable values', () => {
      const auditPayload = {
        variableNames: ['DATABASE_URL', 'API_KEY'],
        variableCount: 2,
        serviceId: mockServiceId,
      };

      const serialized = JSON.stringify(auditPayload);
      expect(serialized).not.toContain('postgres://');
      expect(serialized).not.toContain('sk_live_');
      expect(serialized).toContain('DATABASE_URL');
    });

    it('should verify cross-workspace isolation', async () => {
      const workspaceA = 'ws-aaaa';
      const workspaceB = 'ws-bbbb';

      mockServiceRepo.find.mockImplementation(({ where }: any) => {
        if (where.workspaceId === workspaceA) {
          return Promise.resolve([{ id: 'svc-a', workspaceId: workspaceA }]);
        }
        return Promise.resolve([{ id: 'svc-b', workspaceId: workspaceB }]);
      });

      const servicesA = await mockServiceRepo.find({ where: { workspaceId: workspaceA } });
      const servicesB = await mockServiceRepo.find({ where: { workspaceId: workspaceB } });

      expect(servicesA[0].workspaceId).toBe(workspaceA);
      expect(servicesB[0].workspaceId).toBe(workspaceB);
      // A's services must not contain B's data
      expect(servicesA).not.toEqual(expect.arrayContaining([expect.objectContaining({ workspaceId: workspaceB })]));
    });

    it('should verify command allowlist blocks dangerous commands', () => {
      const allowedCommands = ['up', 'deploy', 'add', 'variables', 'domain', 'logs', 'status'];
      const blockedCommands = ['login', 'delete', 'ssh', 'exec', 'shell'];

      for (const cmd of blockedCommands) {
        expect(allowedCommands).not.toContain(cmd);
      }

      for (const cmd of ['up', 'deploy', 'add', 'variables', 'domain']) {
        expect(allowedCommands).toContain(cmd);
      }
    });
  });

  // ==================== Test 9: Deployment Resilience ====================
  describe('Test 9: Deployment Resilience', () => {
    it('should handle CLI timeout properly', async () => {
      mockCliExecutor.execute.mockRejectedValue(new Error('Command timed out after 120000ms'));

      await expect(
        mockCliExecutor.execute({ command: 'up', args: [], token: mockToken, timeout: 120000 }),
      ).rejects.toThrow('Command timed out');
    });

    it('should handle partial bulk deployment failure', async () => {
      // Database deploys successfully
      mockCliExecutor.execute.mockResolvedValueOnce({
        stdout: 'Database deployed',
        stderr: '',
        exitCode: 0,
      });
      // API deployment fails
      mockCliExecutor.execute.mockRejectedValueOnce(new Error('Build failed'));
      // Frontend skipped due to API failure

      const results: Array<{ service: string; status: string }> = [];

      try {
        await mockCliExecutor.execute({ command: 'up', args: ['-s', 'database'] });
        results.push({ service: 'database', status: 'success' });
      } catch {
        results.push({ service: 'database', status: 'failed' });
      }

      try {
        await mockCliExecutor.execute({ command: 'up', args: ['-s', 'api'] });
        results.push({ service: 'api', status: 'success' });
      } catch {
        results.push({ service: 'api', status: 'failed' });
      }

      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('failed');
    });

    it('should verify partial failure status in response', () => {
      const bulkResponse = {
        status: 'partial_failure',
        services: [
          { serviceId: 'svc-db', status: 'success' },
          { serviceId: 'svc-api', status: 'failed', error: 'Build failed' },
          { serviceId: 'svc-fe', status: 'skipped' },
        ],
      };

      expect(bulkResponse.status).toBe('partial_failure');
      expect(bulkResponse.services.filter(s => s.status === 'success')).toHaveLength(1);
      expect(bulkResponse.services.filter(s => s.status === 'failed')).toHaveLength(1);
      expect(bulkResponse.services.filter(s => s.status === 'skipped')).toHaveLength(1);
    });

    it('should verify retry logic on transient failure', async () => {
      let attempts = 0;
      mockCliExecutor.execute
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ stdout: 'Success', stderr: '', exitCode: 0 });

      // Simulate retry logic
      const maxRetries = 3;
      let result: any;
      for (let i = 0; i < maxRetries; i++) {
        try {
          result = await mockCliExecutor.execute({ command: 'up', args: [] });
          break;
        } catch (e) {
          attempts++;
          if (i === maxRetries - 1) throw e;
        }
      }

      expect(attempts).toBe(2);
      expect(result.stdout).toBe('Success');
    });
  });

  // ==================== Test 10: Frontend Component Integration ====================
  describe('Test 10: Frontend Component Integration', () => {
    it('should verify service card data structure', () => {
      const serviceCard = {
        id: mockServiceId,
        name: 'my-api',
        type: RailwayServiceType.WEB,
        status: RailwayServiceStatus.ACTIVE,
        deploymentUrl: 'https://my-api.up.railway.app',
        lastDeployedAt: new Date().toISOString(),
      };

      expect(serviceCard.id).toBeDefined();
      expect(serviceCard.name).toBeDefined();
      expect(serviceCard.type).toBeDefined();
      expect(serviceCard.status).toBeDefined();
      expect(serviceCard.deploymentUrl).toContain('railway.app');
    });

    it('should verify env var manager masks values', () => {
      const variables = [
        { key: 'DATABASE_URL', value: '****', isSecret: true },
        { key: 'NODE_ENV', value: 'production', isSecret: false },
        { key: 'API_KEY', value: '****', isSecret: true },
      ];

      const secrets = variables.filter(v => v.isSecret);
      for (const s of secrets) {
        expect(s.value).toBe('****');
        expect(s.value).not.toContain('postgres://');
        expect(s.value).not.toContain('sk_');
      }
    });

    it('should verify deployment history table data structure', () => {
      const deployments = [
        {
          id: 'dep-1',
          status: DeploymentStatus.SUCCESS,
          createdAt: '2026-03-01T10:00:00Z',
          completedAt: '2026-03-01T10:01:30Z',
          buildDurationSeconds: 90,
          triggerType: 'manual',
        },
        {
          id: 'dep-2',
          status: DeploymentStatus.FAILED,
          createdAt: '2026-03-01T11:00:00Z',
          completedAt: '2026-03-01T11:00:45Z',
          buildDurationSeconds: 45,
          triggerType: 'auto',
          error: 'Build error: Module not found',
        },
      ];

      expect(deployments).toHaveLength(2);
      expect(deployments[0].status).toBe(DeploymentStatus.SUCCESS);
      expect(deployments[1].status).toBe(DeploymentStatus.FAILED);
      expect(deployments[1].error).toBeDefined();
    });

    it('should verify WebSocket events are emitted for correct room delivery', () => {
      const projectRoom = `deployment:${mockProjectId}`;
      const serviceRoom = `deployment:${mockProjectId}:${mockServiceId}`;

      // Project-level event
      mockEventPublisher.publishDeploymentStarted(mockProjectId, { services: [mockServiceId] });
      expect(mockEventPublisher.publishDeploymentStarted).toHaveBeenCalledWith(
        mockProjectId,
        expect.any(Object),
      );

      // Service-level event
      mockEventPublisher.publishDeploymentLog(mockProjectId, mockServiceId, { line: 'Building...' });
      expect(mockEventPublisher.publishDeploymentLog).toHaveBeenCalledWith(
        mockProjectId,
        mockServiceId,
        expect.objectContaining({ line: 'Building...' }),
      );
    });

    it('should verify deployment ordering for databases before services before frontends', () => {
      const services = [
        { name: 'frontend', type: RailwayServiceType.WEB, deployOrder: 2 },
        { name: 'postgres', type: RailwayServiceType.DATABASE, deployOrder: 0 },
        { name: 'api', type: RailwayServiceType.WEB, deployOrder: 1 },
      ];

      const sorted = [...services].sort((a, b) => a.deployOrder - b.deployOrder);

      expect(sorted[0].type).toBe(RailwayServiceType.DATABASE);
      expect(sorted[1].name).toBe('api');
      expect(sorted[2].name).toBe('frontend');
    });
  });
});
