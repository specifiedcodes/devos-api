/**
 * Railway CLI Deployment DTO Tests
 * Story 23-3: Railway CLI Deployment DTOs
 *
 * TDD: Tests written first, then DTOs implemented.
 */

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ProvisionServiceDto,
  BulkDeployDto,
  AddDomainDto,
  ExecuteCliCommandDto,
  SetServiceVariablesDto,
  RollbackDeploymentDto,
  RailwayServiceEntityDto,
  BulkDeploymentResponseDto,
  DomainResponseDto,
  RailwayStatusResponseDto,
  RailwayCliResultDto,
  ServiceConnectionInfoDto,
} from '../railway.dto';
import { RailwayServiceType, RailwayServiceStatus } from '../../../../../database/entities/railway-service.entity';
import { DeploymentStatus } from '../../../../../database/entities/railway-deployment.entity';

describe('Railway CLI Deployment DTOs', () => {
  // ============================================================
  // ProvisionServiceDto
  // ============================================================
  describe('ProvisionServiceDto', () => {
    it('should accept valid input with required fields only', async () => {
      const dto = plainToInstance(ProvisionServiceDto, {
        name: 'my-api-service',
        serviceType: RailwayServiceType.API,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid input with all optional fields', async () => {
      const dto = plainToInstance(ProvisionServiceDto, {
        name: 'my-database',
        serviceType: RailwayServiceType.DATABASE,
        databaseType: 'postgres',
        githubRepo: 'org/repo',
        sourceDirectory: 'packages/api',
        config: {
          buildCommand: 'npm run build',
          startCommand: 'npm run start',
          healthcheckPath: '/health',
          dockerfile: 'Dockerfile',
        },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject empty name', async () => {
      const dto = plainToInstance(ProvisionServiceDto, {
        name: '',
        serviceType: RailwayServiceType.API,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });

    it('should reject missing name', async () => {
      const dto = plainToInstance(ProvisionServiceDto, {
        serviceType: RailwayServiceType.API,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });

    it('should reject invalid serviceType', async () => {
      const dto = plainToInstance(ProvisionServiceDto, {
        name: 'my-service',
        serviceType: 'invalid-type',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'serviceType')).toBe(true);
    });

    it('should reject missing serviceType', async () => {
      const dto = plainToInstance(ProvisionServiceDto, {
        name: 'my-service',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'serviceType')).toBe(true);
    });

    it('should accept valid databaseType values', async () => {
      for (const dbType of ['postgres', 'redis', 'mysql', 'mongodb']) {
        const dto = plainToInstance(ProvisionServiceDto, {
          name: 'my-db',
          serviceType: RailwayServiceType.DATABASE,
          databaseType: dbType,
        });
        const errors = await validate(dto);
        const dbErrors = errors.filter((e) => e.property === 'databaseType');
        expect(dbErrors).toHaveLength(0);
      }
    });

    it('should reject invalid databaseType', async () => {
      const dto = plainToInstance(ProvisionServiceDto, {
        name: 'my-db',
        serviceType: RailwayServiceType.DATABASE,
        databaseType: 'sqlite',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'databaseType')).toBe(true);
    });

    it('should accept all valid serviceType enum values', async () => {
      for (const st of Object.values(RailwayServiceType)) {
        const dto = plainToInstance(ProvisionServiceDto, {
          name: 'test',
          serviceType: st,
        });
        const errors = await validate(dto);
        const stErrors = errors.filter((e) => e.property === 'serviceType');
        expect(stErrors).toHaveLength(0);
      }
    });
  });

  // ============================================================
  // BulkDeployDto
  // ============================================================
  describe('BulkDeployDto', () => {
    it('should accept empty object (all fields optional)', async () => {
      const dto = plainToInstance(BulkDeployDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid environment and branch', async () => {
      const dto = plainToInstance(BulkDeployDto, {
        environment: 'production',
        branch: 'main',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid serviceIds as UUID array', async () => {
      const dto = plainToInstance(BulkDeployDto, {
        serviceIds: [
          'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
          'b2c3d4e5-f6a7-4901-bcde-f12345678901',
        ],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid UUIDs in serviceIds', async () => {
      const dto = plainToInstance(BulkDeployDto, {
        serviceIds: ['not-a-uuid', 'also-not-uuid'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'serviceIds')).toBe(true);
    });

    it('should accept all fields together', async () => {
      const dto = plainToInstance(BulkDeployDto, {
        environment: 'staging',
        branch: 'develop',
        serviceIds: ['a1b2c3d4-e5f6-4890-abcd-ef1234567890'],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ============================================================
  // AddDomainDto
  // ============================================================
  describe('AddDomainDto', () => {
    it('should accept empty object (all fields optional)', async () => {
      const dto = plainToInstance(AddDomainDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid customDomain', async () => {
      const dto = plainToInstance(AddDomainDto, {
        customDomain: 'example.com',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept subdomain format', async () => {
      const dto = plainToInstance(AddDomainDto, {
        customDomain: 'api.example.com',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept deep subdomain format', async () => {
      const dto = plainToInstance(AddDomainDto, {
        customDomain: 'staging.api.example.com',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid domain format - single word', async () => {
      const dto = plainToInstance(AddDomainDto, {
        customDomain: 'notadomain',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'customDomain')).toBe(true);
    });

    it('should reject invalid domain format - double dots', async () => {
      const dto = plainToInstance(AddDomainDto, {
        customDomain: '..',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'customDomain')).toBe(true);
    });

    it('should reject invalid domain format - single char', async () => {
      const dto = plainToInstance(AddDomainDto, {
        customDomain: 'a',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'customDomain')).toBe(true);
    });

    it('should reject invalid domain format - starts with hyphen', async () => {
      const dto = plainToInstance(AddDomainDto, {
        customDomain: '-example.com',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'customDomain')).toBe(true);
    });

    it('should accept generateRailwayDomain as boolean', async () => {
      const dto = plainToInstance(AddDomainDto, {
        generateRailwayDomain: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept both customDomain and generateRailwayDomain', async () => {
      const dto = plainToInstance(AddDomainDto, {
        customDomain: 'myapp.example.com',
        generateRailwayDomain: false,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ============================================================
  // ExecuteCliCommandDto
  // ============================================================
  describe('ExecuteCliCommandDto', () => {
    const ALLOWED_COMMANDS = [
      'whoami', 'status', 'list', 'init', 'link', 'up', 'add',
      'redeploy', 'restart', 'down', 'domain', 'logs', 'variable',
      'environment', 'service', 'connect',
    ];

    const DENIED_COMMANDS = ['login', 'logout', 'open', 'delete', 'ssh', 'shell', 'run'];

    it.each(ALLOWED_COMMANDS)('should accept allowed command: %s', async (command) => {
      const dto = plainToInstance(ExecuteCliCommandDto, { command });
      const errors = await validate(dto);
      const cmdErrors = errors.filter((e) => e.property === 'command');
      expect(cmdErrors).toHaveLength(0);
    });

    it.each(DENIED_COMMANDS)('should reject denied command: %s', async (command) => {
      const dto = plainToInstance(ExecuteCliCommandDto, { command });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'command')).toBe(true);
    });

    it('should reject empty command', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, { command: '' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'command')).toBe(true);
    });

    it('should reject missing command', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'command')).toBe(true);
    });

    it('should accept optional args as string array', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {
        command: 'up',
        args: ['--detach', '--json'],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept optional service string', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {
        command: 'logs',
        service: 'api',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept optional environment string', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {
        command: 'status',
        environment: 'production',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept valid timeoutMs within range', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {
        command: 'up',
        timeoutMs: 300000,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept timeoutMs at minimum boundary (5000)', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {
        command: 'whoami',
        timeoutMs: 5000,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept timeoutMs at maximum boundary (600000)', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {
        command: 'up',
        timeoutMs: 600000,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject timeoutMs below 5000', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {
        command: 'whoami',
        timeoutMs: 4999,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'timeoutMs')).toBe(true);
    });

    it('should reject timeoutMs above 600000', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {
        command: 'up',
        timeoutMs: 600001,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'timeoutMs')).toBe(true);
    });

    it('should accept all optional fields together', async () => {
      const dto = plainToInstance(ExecuteCliCommandDto, {
        command: 'variable',
        args: ['set', 'KEY=value'],
        service: 'api',
        environment: 'production',
        timeoutMs: 120000,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ============================================================
  // SetServiceVariablesDto
  // ============================================================
  describe('SetServiceVariablesDto', () => {
    it('should accept valid variables object', async () => {
      const dto = plainToInstance(SetServiceVariablesDto, {
        variables: { DATABASE_URL: 'postgres://localhost:5432/db', NODE_ENV: 'production' },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing variables', async () => {
      const dto = plainToInstance(SetServiceVariablesDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'variables')).toBe(true);
    });

    it('should accept single variable', async () => {
      const dto = plainToInstance(SetServiceVariablesDto, {
        variables: { API_KEY: 'abc123' },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ============================================================
  // RollbackDeploymentDto
  // ============================================================
  describe('RollbackDeploymentDto', () => {
    it('should accept valid railwayDeploymentId', async () => {
      const dto = plainToInstance(RollbackDeploymentDto, {
        railwayDeploymentId: 'deploy-abc123-xyz',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject empty railwayDeploymentId', async () => {
      const dto = plainToInstance(RollbackDeploymentDto, {
        railwayDeploymentId: '',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'railwayDeploymentId')).toBe(true);
    });

    it('should reject missing railwayDeploymentId', async () => {
      const dto = plainToInstance(RollbackDeploymentDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'railwayDeploymentId')).toBe(true);
    });
  });

  // ============================================================
  // Response DTOs - Instantiation and Serialization
  // ============================================================
  describe('Response DTOs', () => {
    describe('RailwayServiceEntityDto', () => {
      it('should be instantiable and serializable to JSON', () => {
        const dto = new RailwayServiceEntityDto();
        dto.id = 'uuid-123';
        dto.projectId = 'project-uuid';
        dto.railwayServiceId = 'railway-svc-123';
        dto.name = 'api';
        dto.serviceType = RailwayServiceType.API;
        dto.status = RailwayServiceStatus.ACTIVE;
        dto.deploymentUrl = 'https://api.up.railway.app';
        dto.customDomain = 'api.example.com';
        dto.deployOrder = 1;
        dto.config = { buildCommand: 'npm run build' };
        dto.createdAt = '2026-03-01T00:00:00.000Z';
        dto.updatedAt = '2026-03-01T00:00:00.000Z';

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.id).toBe('uuid-123');
        expect(parsed.serviceType).toBe('api');
        expect(parsed.status).toBe('active');
        expect(parsed.config).toEqual({ buildCommand: 'npm run build' });
      });

      it('should handle optional fields as undefined', () => {
        const dto = new RailwayServiceEntityDto();
        dto.id = 'uuid-123';
        dto.projectId = 'project-uuid';
        dto.railwayServiceId = 'railway-svc-123';
        dto.name = 'worker';
        dto.serviceType = RailwayServiceType.WORKER;
        dto.status = RailwayServiceStatus.PROVISIONING;
        dto.deployOrder = 3;
        dto.config = {};
        dto.createdAt = '2026-03-01T00:00:00.000Z';
        dto.updatedAt = '2026-03-01T00:00:00.000Z';

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.deploymentUrl).toBeUndefined();
        expect(parsed.customDomain).toBeUndefined();
      });
    });

    describe('BulkDeploymentResponseDto', () => {
      it('should be instantiable and serializable to JSON', () => {
        const dto = new BulkDeploymentResponseDto();
        dto.deploymentId = 'bulk-deploy-123';
        dto.services = [
          {
            serviceId: 'svc-1',
            serviceName: 'api',
            status: DeploymentStatus.BUILDING,
          },
          {
            serviceId: 'svc-2',
            serviceName: 'frontend',
            status: DeploymentStatus.QUEUED,
            deploymentUrl: 'https://frontend.up.railway.app',
          },
        ];
        dto.startedAt = '2026-03-01T12:00:00.000Z';
        dto.status = 'in_progress';

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.deploymentId).toBe('bulk-deploy-123');
        expect(parsed.services).toHaveLength(2);
        expect(parsed.status).toBe('in_progress');
      });

      it('should handle partial_failure status', () => {
        const dto = new BulkDeploymentResponseDto();
        dto.deploymentId = 'bulk-deploy-456';
        dto.services = [
          {
            serviceId: 'svc-1',
            serviceName: 'api',
            status: DeploymentStatus.SUCCESS,
          },
          {
            serviceId: 'svc-2',
            serviceName: 'worker',
            status: DeploymentStatus.FAILED,
            error: 'Build timeout',
          },
        ];
        dto.startedAt = '2026-03-01T12:00:00.000Z';
        dto.status = 'partial_failure';

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.status).toBe('partial_failure');
        expect(parsed.services[1].error).toBe('Build timeout');
      });
    });

    describe('DomainResponseDto', () => {
      it('should be instantiable and serializable to JSON', () => {
        const dto = new DomainResponseDto();
        dto.domain = 'api.example.com';
        dto.type = 'custom';
        dto.status = 'pending_dns';
        dto.dnsInstructions = {
          type: 'CNAME',
          name: 'api',
          value: 'custom-domain.up.railway.app',
        };

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.domain).toBe('api.example.com');
        expect(parsed.type).toBe('custom');
        expect(parsed.status).toBe('pending_dns');
        expect(parsed.dnsInstructions.type).toBe('CNAME');
      });

      it('should handle railway domain type without DNS instructions', () => {
        const dto = new DomainResponseDto();
        dto.domain = 'myapp.up.railway.app';
        dto.type = 'railway';
        dto.status = 'active';

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.type).toBe('railway');
        expect(parsed.dnsInstructions).toBeUndefined();
      });
    });

    describe('RailwayStatusResponseDto', () => {
      it('should be instantiable and serializable to JSON', () => {
        const dto = new RailwayStatusResponseDto();
        dto.connected = true;
        dto.username = 'devos-user';
        dto.projectName = 'my-project';
        dto.services = [
          { name: 'api', status: 'active', url: 'https://api.up.railway.app' },
          { name: 'postgres', status: 'active' },
        ];

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.connected).toBe(true);
        expect(parsed.username).toBe('devos-user');
        expect(parsed.services).toHaveLength(2);
      });

      it('should handle disconnected state', () => {
        const dto = new RailwayStatusResponseDto();
        dto.connected = false;
        dto.services = [];

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.connected).toBe(false);
        expect(parsed.username).toBeUndefined();
        expect(parsed.projectName).toBeUndefined();
      });
    });

    describe('RailwayCliResultDto', () => {
      it('should be instantiable and serializable to JSON', () => {
        const dto = new RailwayCliResultDto();
        dto.exitCode = 0;
        dto.output = 'Deployed successfully';
        dto.durationMs = 45230;

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.exitCode).toBe(0);
        expect(parsed.output).toBe('Deployed successfully');
        expect(parsed.durationMs).toBe(45230);
      });

      it('should handle error output', () => {
        const dto = new RailwayCliResultDto();
        dto.exitCode = 1;
        dto.output = '';
        dto.error = 'Authentication failed';
        dto.durationMs = 1200;

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.exitCode).toBe(1);
        expect(parsed.error).toBe('Authentication failed');
      });
    });

    describe('ServiceConnectionInfoDto', () => {
      it('should be instantiable and serializable to JSON', () => {
        const dto = new ServiceConnectionInfoDto();
        dto.serviceId = 'svc-uuid-123';
        dto.serviceName = 'main-db';
        dto.serviceType = RailwayServiceType.DATABASE;
        dto.connectionVariables = [
          { name: 'DATABASE_URL', masked: true, present: true },
          { name: 'PGHOST', masked: true, present: true },
          { name: 'PGPASSWORD', masked: true, present: true },
        ];

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.serviceId).toBe('svc-uuid-123');
        expect(parsed.serviceType).toBe('database');
        expect(parsed.connectionVariables).toHaveLength(3);
        expect(parsed.connectionVariables[0].masked).toBe(true);
      });

      it('should handle cache service type', () => {
        const dto = new ServiceConnectionInfoDto();
        dto.serviceId = 'svc-uuid-456';
        dto.serviceName = 'redis-cache';
        dto.serviceType = RailwayServiceType.CACHE;
        dto.connectionVariables = [
          { name: 'REDIS_URL', masked: true, present: true },
          { name: 'REDIS_PASSWORD', masked: true, present: false },
        ];

        const json = JSON.stringify(dto);
        const parsed = JSON.parse(json);
        expect(parsed.serviceType).toBe('cache');
        expect(parsed.connectionVariables[1].present).toBe(false);
      });
    });
  });

  // ============================================================
  // Existing DTOs remain unchanged
  // ============================================================
  describe('Existing DTOs backward compatibility', () => {
    it('should still export CreateRailwayProjectDto', async () => {
      const { CreateRailwayProjectDto } = await import('../railway.dto');
      expect(CreateRailwayProjectDto).toBeDefined();
    });

    it('should still export TriggerDeploymentDto', async () => {
      const { TriggerDeploymentDto } = await import('../railway.dto');
      expect(TriggerDeploymentDto).toBeDefined();
    });

    it('should still export SetEnvironmentVariablesDto', async () => {
      const { SetEnvironmentVariablesDto } = await import('../railway.dto');
      expect(SetEnvironmentVariablesDto).toBeDefined();
    });

    it('should still export DeploymentListQueryDto', async () => {
      const { DeploymentListQueryDto } = await import('../railway.dto');
      expect(DeploymentListQueryDto).toBeDefined();
    });

    it('should still export RailwayProjectResponseDto', async () => {
      const { RailwayProjectResponseDto } = await import('../railway.dto');
      expect(RailwayProjectResponseDto).toBeDefined();
    });

    it('should still export DeploymentResponseDto', async () => {
      const { DeploymentResponseDto } = await import('../railway.dto');
      expect(DeploymentResponseDto).toBeDefined();
    });

    it('should still export DeploymentListResponseDto', async () => {
      const { DeploymentListResponseDto } = await import('../railway.dto');
      expect(DeploymentListResponseDto).toBeDefined();
    });

    it('should still export SetVariablesResponseDto', async () => {
      const { SetVariablesResponseDto } = await import('../railway.dto');
      expect(SetVariablesResponseDto).toBeDefined();
    });
  });
});
