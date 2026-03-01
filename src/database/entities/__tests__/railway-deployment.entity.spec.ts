/**
 * RailwayDeployment Entity Tests
 *
 * Story 23-2: RailwayDeployment Entity and Migration
 *
 * Tests for entity structure, DeploymentStatus enum values, column metadata,
 * indexes, relations, defaults, and migration reversibility.
 * Uses TypeORM getMetadataArgsStorage() for metadata inspection.
 */
import { getMetadataArgsStorage } from 'typeorm';
import {
  RailwayDeployment,
  DeploymentStatus,
} from '../railway-deployment.entity';
import { RailwayServiceEntity } from '../railway-service.entity';
import { CreateRailwayDeploymentsTable1778100000000 } from '../../migrations/1778100000000-CreateRailwayDeploymentsTable';

describe('RailwayDeployment', () => {
  const metadata = getMetadataArgsStorage();

  // =========================================================================
  // AC2: DeploymentStatus enum
  // =========================================================================
  describe('DeploymentStatus enum', () => {
    it('should have exactly 8 values', () => {
      const values = Object.values(DeploymentStatus);
      expect(values).toHaveLength(8);
    });

    it('should have correct enum values', () => {
      expect(DeploymentStatus.QUEUED).toBe('queued');
      expect(DeploymentStatus.BUILDING).toBe('building');
      expect(DeploymentStatus.DEPLOYING).toBe('deploying');
      expect(DeploymentStatus.SUCCESS).toBe('success');
      expect(DeploymentStatus.FAILED).toBe('failed');
      expect(DeploymentStatus.CRASHED).toBe('crashed');
      expect(DeploymentStatus.CANCELLED).toBe('cancelled');
      expect(DeploymentStatus.ROLLED_BACK).toBe('rolled_back');
    });

    it('should contain all expected values', () => {
      const values = Object.values(DeploymentStatus);
      expect(values).toContain('queued');
      expect(values).toContain('building');
      expect(values).toContain('deploying');
      expect(values).toContain('success');
      expect(values).toContain('failed');
      expect(values).toContain('crashed');
      expect(values).toContain('cancelled');
      expect(values).toContain('rolled_back');
    });

    it('should have unique values (no duplicates)', () => {
      const values = Object.values(DeploymentStatus);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  // =========================================================================
  // AC1: Entity table name and structure
  // =========================================================================
  describe('Entity table metadata', () => {
    it('should have table name "railway_deployments"', () => {
      const tableMetadata = metadata.tables.find(
        (t) => t.target === RailwayDeployment,
      );
      expect(tableMetadata).toBeDefined();
      expect(tableMetadata!.name).toBe('railway_deployments');
    });

    it('should have uuid primary generated column "id"', () => {
      const generatedColumns = metadata.generations.filter(
        (g) => g.target === RailwayDeployment,
      );
      const idGen = generatedColumns.find((g) => g.propertyName === 'id');
      expect(idGen).toBeDefined();
      expect(idGen!.strategy).toBe('uuid');
    });
  });

  // =========================================================================
  // AC1: Column definitions
  // =========================================================================
  describe('Entity columns', () => {
    it('should have all required columns', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayDeployment,
      );
      const columnNames = columns.map((c) => c.propertyName);

      expect(columnNames).toContain('railwayServiceEntityId');
      expect(columnNames).toContain('projectId');
      expect(columnNames).toContain('workspaceId');
      expect(columnNames).toContain('railwayDeploymentId');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('deploymentUrl');
      expect(columnNames).toContain('commitSha');
      expect(columnNames).toContain('branch');
      expect(columnNames).toContain('triggeredBy');
      expect(columnNames).toContain('triggerType');
      expect(columnNames).toContain('buildDurationSeconds');
      expect(columnNames).toContain('deployDurationSeconds');
      expect(columnNames).toContain('errorMessage');
      expect(columnNames).toContain('meta');
      expect(columnNames).toContain('startedAt');
      expect(columnNames).toContain('completedAt');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('updatedAt');
    });

    it('should have correct snake_case column name mappings', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayDeployment,
      );

      const findCol = (prop: string) => columns.find((c) => c.propertyName === prop);

      expect(findCol('railwayServiceEntityId')?.options?.name).toBe('railway_service_entity_id');
      expect(findCol('projectId')?.options?.name).toBe('project_id');
      expect(findCol('workspaceId')?.options?.name).toBe('workspace_id');
      expect(findCol('railwayDeploymentId')?.options?.name).toBe('railway_deployment_id');
      expect(findCol('deploymentUrl')?.options?.name).toBe('deployment_url');
      expect(findCol('commitSha')?.options?.name).toBe('commit_sha');
      expect(findCol('triggeredBy')?.options?.name).toBe('triggered_by');
      expect(findCol('triggerType')?.options?.name).toBe('trigger_type');
      expect(findCol('buildDurationSeconds')?.options?.name).toBe('build_duration_seconds');
      expect(findCol('deployDurationSeconds')?.options?.name).toBe('deploy_duration_seconds');
      expect(findCol('errorMessage')?.options?.name).toBe('error_message');
      expect(findCol('startedAt')?.options?.name).toBe('started_at');
      expect(findCol('completedAt')?.options?.name).toBe('completed_at');
      expect(findCol('createdAt')?.options?.name).toBe('created_at');
      expect(findCol('updatedAt')?.options?.name).toBe('updated_at');
    });

    it('should have nullable columns for optional fields', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayDeployment,
      );

      const findCol = (prop: string) => columns.find((c) => c.propertyName === prop);

      expect(findCol('deploymentUrl')?.options?.nullable).toBe(true);
      expect(findCol('commitSha')?.options?.nullable).toBe(true);
      expect(findCol('branch')?.options?.nullable).toBe(true);
      expect(findCol('triggeredBy')?.options?.nullable).toBe(true);
      expect(findCol('triggerType')?.options?.nullable).toBe(true);
      expect(findCol('buildDurationSeconds')?.options?.nullable).toBe(true);
      expect(findCol('deployDurationSeconds')?.options?.nullable).toBe(true);
      expect(findCol('errorMessage')?.options?.nullable).toBe(true);
      expect(findCol('startedAt')?.options?.nullable).toBe(true);
      expect(findCol('completedAt')?.options?.nullable).toBe(true);
    });

    it('should have correct column types', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayDeployment,
      );

      const findCol = (prop: string) => columns.find((c) => c.propertyName === prop);

      expect(findCol('railwayServiceEntityId')?.options?.type).toBe('uuid');
      expect(findCol('projectId')?.options?.type).toBe('uuid');
      expect(findCol('workspaceId')?.options?.type).toBe('uuid');
      expect(findCol('railwayDeploymentId')?.options?.type).toBe('varchar');
      expect(findCol('status')?.options?.type).toBe('enum');
      expect(findCol('deploymentUrl')?.options?.type).toBe('varchar');
      expect(findCol('commitSha')?.options?.type).toBe('varchar');
      expect(findCol('branch')?.options?.type).toBe('varchar');
      expect(findCol('triggeredBy')?.options?.type).toBe('varchar');
      expect(findCol('triggerType')?.options?.type).toBe('varchar');
      expect(findCol('buildDurationSeconds')?.options?.type).toBe('int');
      expect(findCol('deployDurationSeconds')?.options?.type).toBe('int');
      expect(findCol('errorMessage')?.options?.type).toBe('text');
      expect(findCol('meta')?.options?.type).toBe('jsonb');
      expect(findCol('startedAt')?.options?.type).toBe('timestamp');
      expect(findCol('completedAt')?.options?.type).toBe('timestamp');
    });

    it('should have correct varchar lengths', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayDeployment,
      );

      const findCol = (prop: string) => columns.find((c) => c.propertyName === prop);

      expect(findCol('railwayDeploymentId')?.options?.length).toBe(100);
      expect(findCol('deploymentUrl')?.options?.length).toBe(500);
      expect(findCol('commitSha')?.options?.length).toBe(100);
      expect(findCol('branch')?.options?.length).toBe(100);
      expect(findCol('triggeredBy')?.options?.length).toBe(100);
      expect(findCol('triggerType')?.options?.length).toBe(50);
    });
  });

  // =========================================================================
  // AC6: Default values
  // =========================================================================
  describe('Default values', () => {
    it('should have default meta of empty object', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayDeployment,
      );
      const metaCol = columns.find((c) => c.propertyName === 'meta');
      expect(metaCol?.options?.default).toEqual({});
    });
  });

  // =========================================================================
  // Timestamp columns
  // =========================================================================
  describe('Timestamp columns', () => {
    it('should have CreateDateColumn on createdAt', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayDeployment,
      );
      const createdAtCol = columns.find((c) => c.propertyName === 'createdAt');
      expect(createdAtCol).toBeDefined();
      expect(createdAtCol?.mode).toBe('createDate');
      expect(createdAtCol?.options?.name).toBe('created_at');
    });

    it('should have UpdateDateColumn on updatedAt', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayDeployment,
      );
      const updatedAtCol = columns.find((c) => c.propertyName === 'updatedAt');
      expect(updatedAtCol).toBeDefined();
      expect(updatedAtCol?.mode).toBe('updateDate');
      expect(updatedAtCol?.options?.name).toBe('updated_at');
    });
  });

  // =========================================================================
  // AC3: ManyToOne relation to RailwayServiceEntity
  // =========================================================================
  describe('Relations', () => {
    it('should have ManyToOne relation to RailwayServiceEntity', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === RailwayDeployment,
      );
      const serviceRelation = relations.find(
        (r) => r.propertyName === 'railwayServiceEntity',
      );
      expect(serviceRelation).toBeDefined();
      expect(serviceRelation!.relationType).toBe('many-to-one');
    });

    it('should have JoinColumn on railway_service_entity_id', () => {
      const joinColumns = metadata.joinColumns.filter(
        (jc) => jc.target === RailwayDeployment,
      );
      const serviceJoin = joinColumns.find(
        (jc) => jc.propertyName === 'railwayServiceEntity',
      );
      expect(serviceJoin).toBeDefined();
      expect(serviceJoin!.name).toBe('railway_service_entity_id');
    });

    it('should have onDelete CASCADE on RailwayServiceEntity relation', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === RailwayDeployment,
      );
      const serviceRelation = relations.find(
        (r) => r.propertyName === 'railwayServiceEntity',
      );
      expect(serviceRelation).toBeDefined();
      expect(serviceRelation!.options?.onDelete).toBe('CASCADE');
    });
  });

  // =========================================================================
  // AC4: Indexes
  // =========================================================================
  describe('Indexes', () => {
    it('should have composite index on (railwayServiceEntityId, createdAt)', () => {
      const indexes = metadata.indices.filter(
        (i) => i.target === RailwayDeployment,
      );
      const compositeIndex = indexes.find(
        (i) =>
          Array.isArray(i.columns) &&
          i.columns.includes('railwayServiceEntityId') &&
          i.columns.includes('createdAt'),
      );
      expect(compositeIndex).toBeDefined();
    });

    it('should have index on projectId', () => {
      const indexes = metadata.indices.filter(
        (i) => i.target === RailwayDeployment,
      );
      const projectIdIndex = indexes.find(
        (i) =>
          Array.isArray(i.columns) &&
          i.columns.length === 1 &&
          i.columns.includes('projectId'),
      );
      expect(projectIdIndex).toBeDefined();
    });

    it('should have index on workspaceId', () => {
      const indexes = metadata.indices.filter(
        (i) => i.target === RailwayDeployment,
      );
      const workspaceIdIndex = indexes.find(
        (i) =>
          Array.isArray(i.columns) &&
          i.columns.length === 1 &&
          i.columns.includes('workspaceId'),
      );
      expect(workspaceIdIndex).toBeDefined();
    });

    it('should have index on status', () => {
      const indexes = metadata.indices.filter(
        (i) => i.target === RailwayDeployment,
      );
      const statusIndex = indexes.find(
        (i) =>
          Array.isArray(i.columns) &&
          i.columns.length === 1 &&
          i.columns.includes('status'),
      );
      expect(statusIndex).toBeDefined();
    });
  });

  // =========================================================================
  // AC7: Entity instantiation and CRUD shape
  // =========================================================================
  describe('Entity instantiation', () => {
    it('should be instantiable with all required fields', () => {
      const entity = new RailwayDeployment();
      entity.id = '550e8400-e29b-41d4-a716-446655440000';
      entity.railwayServiceEntityId = '550e8400-e29b-41d4-a716-446655440001';
      entity.projectId = '550e8400-e29b-41d4-a716-446655440002';
      entity.workspaceId = '550e8400-e29b-41d4-a716-446655440003';
      entity.railwayDeploymentId = 'railway-deploy-abc123';
      entity.status = DeploymentStatus.QUEUED;
      entity.meta = {};
      entity.createdAt = new Date();
      entity.updatedAt = new Date();

      expect(entity.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(entity.railwayServiceEntityId).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(entity.projectId).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(entity.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440003');
      expect(entity.railwayDeploymentId).toBe('railway-deploy-abc123');
      expect(entity.status).toBe(DeploymentStatus.QUEUED);
      expect(entity.meta).toEqual({});
    });

    it('should allow nullable fields to be undefined', () => {
      const entity = new RailwayDeployment();
      entity.id = '550e8400-e29b-41d4-a716-446655440000';
      entity.railwayServiceEntityId = '550e8400-e29b-41d4-a716-446655440001';
      entity.projectId = '550e8400-e29b-41d4-a716-446655440002';
      entity.workspaceId = '550e8400-e29b-41d4-a716-446655440003';
      entity.railwayDeploymentId = 'railway-deploy-abc123';
      entity.status = DeploymentStatus.BUILDING;
      entity.meta = {};

      expect(entity.deploymentUrl).toBeUndefined();
      expect(entity.commitSha).toBeUndefined();
      expect(entity.branch).toBeUndefined();
      expect(entity.triggeredBy).toBeUndefined();
      expect(entity.triggerType).toBeUndefined();
      expect(entity.buildDurationSeconds).toBeUndefined();
      expect(entity.deployDurationSeconds).toBeUndefined();
      expect(entity.errorMessage).toBeUndefined();
      expect(entity.startedAt).toBeUndefined();
      expect(entity.completedAt).toBeUndefined();
    });

    it('should allow setting all nullable fields', () => {
      const entity = new RailwayDeployment();
      const now = new Date();

      entity.deploymentUrl = 'https://myapp-api.up.railway.app';
      entity.commitSha = 'abc123def456';
      entity.branch = 'main';
      entity.triggeredBy = 'user-uuid-123';
      entity.triggerType = 'manual';
      entity.buildDurationSeconds = 120;
      entity.deployDurationSeconds = 30;
      entity.errorMessage = 'Build failed: npm install error';
      entity.startedAt = now;
      entity.completedAt = now;

      expect(entity.deploymentUrl).toBe('https://myapp-api.up.railway.app');
      expect(entity.commitSha).toBe('abc123def456');
      expect(entity.branch).toBe('main');
      expect(entity.triggeredBy).toBe('user-uuid-123');
      expect(entity.triggerType).toBe('manual');
      expect(entity.buildDurationSeconds).toBe(120);
      expect(entity.deployDurationSeconds).toBe(30);
      expect(entity.errorMessage).toBe('Build failed: npm install error');
      expect(entity.startedAt).toBe(now);
      expect(entity.completedAt).toBe(now);
    });

    it('should support all deployment status values', () => {
      const entity = new RailwayDeployment();

      entity.status = DeploymentStatus.QUEUED;
      expect(entity.status).toBe('queued');

      entity.status = DeploymentStatus.BUILDING;
      expect(entity.status).toBe('building');

      entity.status = DeploymentStatus.DEPLOYING;
      expect(entity.status).toBe('deploying');

      entity.status = DeploymentStatus.SUCCESS;
      expect(entity.status).toBe('success');

      entity.status = DeploymentStatus.FAILED;
      expect(entity.status).toBe('failed');

      entity.status = DeploymentStatus.CRASHED;
      expect(entity.status).toBe('crashed');

      entity.status = DeploymentStatus.CANCELLED;
      expect(entity.status).toBe('cancelled');

      entity.status = DeploymentStatus.ROLLED_BACK;
      expect(entity.status).toBe('rolled_back');
    });

    it('should store meta as Record<string, unknown>', () => {
      const entity = new RailwayDeployment();
      entity.meta = {
        buildLogSummary: '45 packages installed',
        resourceUsage: { cpu: '0.5', memory: '256MB' },
        healthCheckResult: { status: 200, latencyMs: 50 },
      };

      expect(entity.meta).toHaveProperty('buildLogSummary');
      expect(entity.meta).toHaveProperty('resourceUsage');
      expect(entity.meta).toHaveProperty('healthCheckResult');
    });

    it('should support triggeredBy with various actor types', () => {
      const entity = new RailwayDeployment();

      entity.triggeredBy = '550e8400-e29b-41d4-a716-446655440000'; // userId
      expect(entity.triggeredBy).toBe('550e8400-e29b-41d4-a716-446655440000');

      entity.triggeredBy = 'devops-agent';
      expect(entity.triggeredBy).toBe('devops-agent');

      entity.triggeredBy = 'auto-deploy';
      expect(entity.triggeredBy).toBe('auto-deploy');
    });

    it('should support all trigger types', () => {
      const entity = new RailwayDeployment();

      entity.triggerType = 'manual';
      expect(entity.triggerType).toBe('manual');

      entity.triggerType = 'agent';
      expect(entity.triggerType).toBe('agent');

      entity.triggerType = 'webhook';
      expect(entity.triggerType).toBe('webhook');

      entity.triggerType = 'rollback';
      expect(entity.triggerType).toBe('rollback');

      entity.triggerType = 'redeploy';
      expect(entity.triggerType).toBe('redeploy');
    });

    it('should allow startedAt and completedAt to be set independently', () => {
      const entity = new RailwayDeployment();
      const startTime = new Date('2026-03-01T10:00:00Z');

      // Initially only startedAt is set
      entity.startedAt = startTime;
      expect(entity.startedAt).toEqual(startTime);
      expect(entity.completedAt).toBeUndefined();

      // Later, completedAt is set
      const endTime = new Date('2026-03-01T10:05:00Z');
      entity.completedAt = endTime;
      expect(entity.completedAt).toEqual(endTime);
    });
  });

  // =========================================================================
  // AC5: Migration file
  // =========================================================================
  describe('Migration', () => {
    it('should have up method defined', () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      expect(typeof migration.up).toBe('function');
    });

    it('should have down method defined', () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      expect(typeof migration.down).toBe('function');
    });

    it('should be reversible (both up and down are async functions)', () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
        dropTable: jest.fn().mockResolvedValue(undefined),
      } as any;

      expect(migration.up(mockQueryRunner)).toBeInstanceOf(Promise);
      expect(migration.down(mockQueryRunner)).toBeInstanceOf(Promise);
    });

    it('should create table with correct name in up()', async () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(1);
      const tableArg = mockQueryRunner.createTable.mock.calls[0][0];
      expect(tableArg.name).toBe('railway_deployments');
    });

    it('should create FK to railway_services with CASCADE in up()', async () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      expect(mockQueryRunner.createForeignKey).toHaveBeenCalled();

      // Find the FK for railway_service_entity_id
      const fkCalls = mockQueryRunner.createForeignKey.mock.calls;
      const serviceFk = fkCalls.find(
        (call: any[]) =>
          call[1].columnNames.includes('railway_service_entity_id'),
      );
      expect(serviceFk).toBeDefined();
      expect(serviceFk![1].referencedTableName).toBe('railway_services');
      expect(serviceFk![1].referencedColumnNames).toContain('id');
      expect(serviceFk![1].onDelete).toBe('CASCADE');
    });

    it('should create all required indexes in up()', async () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      // Should create 4 indexes
      expect(mockQueryRunner.createIndex).toHaveBeenCalledTimes(4);

      const calls = mockQueryRunner.createIndex.mock.calls;

      // Verify composite index on (railway_service_entity_id, created_at)
      const compositeIdx = calls.find(
        (call: any[]) =>
          call[1].columnNames.includes('railway_service_entity_id') &&
          call[1].columnNames.includes('created_at'),
      );
      expect(compositeIdx).toBeDefined();

      // Verify project_id index
      const projectIdx = calls.find(
        (call: any[]) =>
          call[1].columnNames.length === 1 &&
          call[1].columnNames.includes('project_id'),
      );
      expect(projectIdx).toBeDefined();

      // Verify workspace_id index
      const workspaceIdx = calls.find(
        (call: any[]) =>
          call[1].columnNames.length === 1 &&
          call[1].columnNames.includes('workspace_id'),
      );
      expect(workspaceIdx).toBeDefined();

      // Verify status index
      const statusIdx = calls.find(
        (call: any[]) =>
          call[1].columnNames.length === 1 &&
          call[1].columnNames.includes('status'),
      );
      expect(statusIdx).toBeDefined();
    });

    it('should drop table in down()', async () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      const mockQueryRunner = {
        dropTable: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.down(mockQueryRunner);

      expect(mockQueryRunner.dropTable).toHaveBeenCalledWith('railway_deployments', true);
    });

    it('should create table with all required columns', async () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      const tableArg = mockQueryRunner.createTable.mock.calls[0][0];
      const columnNames = tableArg.columns.map((c: any) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('railway_service_entity_id');
      expect(columnNames).toContain('project_id');
      expect(columnNames).toContain('workspace_id');
      expect(columnNames).toContain('railway_deployment_id');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('deployment_url');
      expect(columnNames).toContain('commit_sha');
      expect(columnNames).toContain('branch');
      expect(columnNames).toContain('triggered_by');
      expect(columnNames).toContain('trigger_type');
      expect(columnNames).toContain('build_duration_seconds');
      expect(columnNames).toContain('deploy_duration_seconds');
      expect(columnNames).toContain('error_message');
      expect(columnNames).toContain('meta');
      expect(columnNames).toContain('started_at');
      expect(columnNames).toContain('completed_at');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should set correct defaults on columns', async () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      const tableArg = mockQueryRunner.createTable.mock.calls[0][0];
      const findCol = (name: string) => tableArg.columns.find((c: any) => c.name === name);

      // UUID default
      expect(findCol('id').default).toBe('uuid_generate_v4()');

      // JSONB default
      expect(findCol('meta').default).toBe("'{}'");

      // Timestamp defaults
      expect(findCol('created_at').default).toBe('CURRENT_TIMESTAMP');
      expect(findCol('updated_at').default).toBe('CURRENT_TIMESTAMP');
    });

    it('should have correct enum values for status column', async () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      const tableArg = mockQueryRunner.createTable.mock.calls[0][0];
      const statusCol = tableArg.columns.find((c: any) => c.name === 'status');
      expect(statusCol.type).toBe('enum');
      expect(statusCol.enum).toContain('queued');
      expect(statusCol.enum).toContain('building');
      expect(statusCol.enum).toContain('deploying');
      expect(statusCol.enum).toContain('success');
      expect(statusCol.enum).toContain('failed');
      expect(statusCol.enum).toContain('crashed');
      expect(statusCol.enum).toContain('cancelled');
      expect(statusCol.enum).toContain('rolled_back');
      expect(statusCol.enum).toHaveLength(8);
    });

    it('should have correct nullable settings on columns', async () => {
      const migration = new CreateRailwayDeploymentsTable1778100000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      const tableArg = mockQueryRunner.createTable.mock.calls[0][0];
      const findCol = (name: string) => tableArg.columns.find((c: any) => c.name === name);

      // Required fields should NOT be nullable
      expect(findCol('id').isNullable).toBeFalsy();
      expect(findCol('railway_service_entity_id').isNullable).toBeFalsy();
      expect(findCol('project_id').isNullable).toBeFalsy();
      expect(findCol('workspace_id').isNullable).toBeFalsy();
      expect(findCol('railway_deployment_id').isNullable).toBeFalsy();
      expect(findCol('status').isNullable).toBeFalsy();

      // Optional fields SHOULD be nullable
      expect(findCol('deployment_url').isNullable).toBe(true);
      expect(findCol('commit_sha').isNullable).toBe(true);
      expect(findCol('branch').isNullable).toBe(true);
      expect(findCol('triggered_by').isNullable).toBe(true);
      expect(findCol('trigger_type').isNullable).toBe(true);
      expect(findCol('build_duration_seconds').isNullable).toBe(true);
      expect(findCol('deploy_duration_seconds').isNullable).toBe(true);
      expect(findCol('error_message').isNullable).toBe(true);
      expect(findCol('started_at').isNullable).toBe(true);
      expect(findCol('completed_at').isNullable).toBe(true);
    });
  });
});
