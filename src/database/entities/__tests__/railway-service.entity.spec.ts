/**
 * RailwayServiceEntity Tests
 *
 * Story 23-1: RailwayServiceEntity and Migration
 *
 * Tests for entity structure, enum values, column metadata, indexes,
 * relations, defaults, and migration reversibility.
 * Uses TypeORM getMetadataArgsStorage() for metadata inspection.
 */
import { getMetadataArgsStorage } from 'typeorm';
import {
  RailwayServiceEntity,
  RailwayServiceType,
  RailwayServiceStatus,
} from '../railway-service.entity';
import { CreateRailwayServicesTable1778000000000 } from '../../migrations/1778000000000-CreateRailwayServicesTable';

describe('RailwayServiceEntity', () => {
  const metadata = getMetadataArgsStorage();

  // =========================================================================
  // AC2: Enum values
  // =========================================================================
  describe('RailwayServiceType enum', () => {
    it('should have exactly 6 values', () => {
      const values = Object.values(RailwayServiceType);
      expect(values).toHaveLength(6);
    });

    it('should have correct enum values', () => {
      expect(RailwayServiceType.WEB).toBe('web');
      expect(RailwayServiceType.API).toBe('api');
      expect(RailwayServiceType.WORKER).toBe('worker');
      expect(RailwayServiceType.DATABASE).toBe('database');
      expect(RailwayServiceType.CACHE).toBe('cache');
      expect(RailwayServiceType.CRON).toBe('cron');
    });

    it('should contain all expected values', () => {
      const values = Object.values(RailwayServiceType);
      expect(values).toContain('web');
      expect(values).toContain('api');
      expect(values).toContain('worker');
      expect(values).toContain('database');
      expect(values).toContain('cache');
      expect(values).toContain('cron');
    });
  });

  describe('RailwayServiceStatus enum', () => {
    it('should have exactly 6 values', () => {
      const values = Object.values(RailwayServiceStatus);
      expect(values).toHaveLength(6);
    });

    it('should have correct enum values', () => {
      expect(RailwayServiceStatus.PROVISIONING).toBe('provisioning');
      expect(RailwayServiceStatus.ACTIVE).toBe('active');
      expect(RailwayServiceStatus.DEPLOYING).toBe('deploying');
      expect(RailwayServiceStatus.FAILED).toBe('failed');
      expect(RailwayServiceStatus.STOPPED).toBe('stopped');
      expect(RailwayServiceStatus.REMOVED).toBe('removed');
    });

    it('should contain all expected values', () => {
      const values = Object.values(RailwayServiceStatus);
      expect(values).toContain('provisioning');
      expect(values).toContain('active');
      expect(values).toContain('deploying');
      expect(values).toContain('failed');
      expect(values).toContain('stopped');
      expect(values).toContain('removed');
    });
  });

  // =========================================================================
  // AC1: Entity table name and structure
  // =========================================================================
  describe('Entity table metadata', () => {
    it('should have table name "railway_services"', () => {
      const tableMetadata = metadata.tables.find(
        (t) => t.target === RailwayServiceEntity,
      );
      expect(tableMetadata).toBeDefined();
      expect(tableMetadata!.name).toBe('railway_services');
    });

    it('should have uuid primary generated column "id"', () => {
      const generatedColumns = metadata.generations.filter(
        (g) => g.target === RailwayServiceEntity,
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
        (c) => c.target === RailwayServiceEntity,
      );
      const columnNames = columns.map((c) => c.propertyName);

      expect(columnNames).toContain('projectId');
      expect(columnNames).toContain('workspaceId');
      expect(columnNames).toContain('railwayProjectId');
      expect(columnNames).toContain('railwayServiceId');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('serviceType');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('deploymentUrl');
      expect(columnNames).toContain('customDomain');
      expect(columnNames).toContain('railwayEnvironmentId');
      expect(columnNames).toContain('githubRepo');
      expect(columnNames).toContain('sourceDirectory');
      expect(columnNames).toContain('deployOrder');
      expect(columnNames).toContain('config');
      expect(columnNames).toContain('resourceInfo');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('updatedAt');
    });

    it('should have correct snake_case column name mappings', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );

      const findCol = (prop: string) => columns.find((c) => c.propertyName === prop);

      expect(findCol('projectId')?.options?.name).toBe('project_id');
      expect(findCol('workspaceId')?.options?.name).toBe('workspace_id');
      expect(findCol('railwayProjectId')?.options?.name).toBe('railway_project_id');
      expect(findCol('railwayServiceId')?.options?.name).toBe('railway_service_id');
      expect(findCol('serviceType')?.options?.name).toBe('service_type');
      expect(findCol('deploymentUrl')?.options?.name).toBe('deployment_url');
      expect(findCol('customDomain')?.options?.name).toBe('custom_domain');
      expect(findCol('railwayEnvironmentId')?.options?.name).toBe('railway_environment_id');
      expect(findCol('githubRepo')?.options?.name).toBe('github_repo');
      expect(findCol('sourceDirectory')?.options?.name).toBe('source_directory');
      expect(findCol('deployOrder')?.options?.name).toBe('deploy_order');
      expect(findCol('resourceInfo')?.options?.name).toBe('resource_info');
      expect(findCol('createdAt')?.options?.name).toBe('created_at');
      expect(findCol('updatedAt')?.options?.name).toBe('updated_at');
    });

    it('should have nullable columns for optional fields', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );

      const findCol = (prop: string) => columns.find((c) => c.propertyName === prop);

      expect(findCol('deploymentUrl')?.options?.nullable).toBe(true);
      expect(findCol('customDomain')?.options?.nullable).toBe(true);
      expect(findCol('railwayEnvironmentId')?.options?.nullable).toBe(true);
      expect(findCol('githubRepo')?.options?.nullable).toBe(true);
      expect(findCol('sourceDirectory')?.options?.nullable).toBe(true);
    });

    it('should have correct column types', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );

      const findCol = (prop: string) => columns.find((c) => c.propertyName === prop);

      expect(findCol('projectId')?.options?.type).toBe('uuid');
      expect(findCol('workspaceId')?.options?.type).toBe('uuid');
      expect(findCol('railwayProjectId')?.options?.type).toBe('varchar');
      expect(findCol('railwayServiceId')?.options?.type).toBe('varchar');
      expect(findCol('name')?.options?.type).toBe('varchar');
      expect(findCol('serviceType')?.options?.type).toBe('enum');
      expect(findCol('status')?.options?.type).toBe('enum');
      expect(findCol('deployOrder')?.options?.type).toBe('int');
      expect(findCol('config')?.options?.type).toBe('jsonb');
      expect(findCol('resourceInfo')?.options?.type).toBe('jsonb');
    });

    it('should have correct varchar lengths', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );

      const findCol = (prop: string) => columns.find((c) => c.propertyName === prop);

      expect(findCol('railwayProjectId')?.options?.length).toBe(100);
      expect(findCol('railwayServiceId')?.options?.length).toBe(100);
      expect(findCol('name')?.options?.length).toBe(100);
      expect(findCol('deploymentUrl')?.options?.length).toBe(500);
      expect(findCol('customDomain')?.options?.length).toBe(500);
      expect(findCol('railwayEnvironmentId')?.options?.length).toBe(100);
      expect(findCol('githubRepo')?.options?.length).toBe(100);
      expect(findCol('sourceDirectory')?.options?.length).toBe(100);
    });
  });

  // =========================================================================
  // AC6: Default values
  // =========================================================================
  describe('Default values', () => {
    it('should have default status of PROVISIONING', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );
      const statusCol = columns.find((c) => c.propertyName === 'status');
      expect(statusCol?.options?.default).toBe(RailwayServiceStatus.PROVISIONING);
    });

    it('should have default deployOrder of 0', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );
      const deployOrderCol = columns.find((c) => c.propertyName === 'deployOrder');
      expect(deployOrderCol?.options?.default).toBe(0);
    });

    it('should have default config of empty object', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );
      const configCol = columns.find((c) => c.propertyName === 'config');
      expect(configCol?.options?.default).toEqual({});
    });

    it('should have default resourceInfo of empty object', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );
      const resourceInfoCol = columns.find((c) => c.propertyName === 'resourceInfo');
      expect(resourceInfoCol?.options?.default).toEqual({});
    });
  });

  // =========================================================================
  // AC1: CreateDateColumn and UpdateDateColumn
  // =========================================================================
  describe('Timestamp columns', () => {
    it('should have CreateDateColumn on createdAt', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );
      const createdAtCol = columns.find((c) => c.propertyName === 'createdAt');
      expect(createdAtCol).toBeDefined();
      expect(createdAtCol?.mode).toBe('createDate');
      expect(createdAtCol?.options?.name).toBe('created_at');
    });

    it('should have UpdateDateColumn on updatedAt', () => {
      const columns = metadata.columns.filter(
        (c) => c.target === RailwayServiceEntity,
      );
      const updatedAtCol = columns.find((c) => c.propertyName === 'updatedAt');
      expect(updatedAtCol).toBeDefined();
      expect(updatedAtCol?.mode).toBe('updateDate');
      expect(updatedAtCol?.options?.name).toBe('updated_at');
    });
  });

  // =========================================================================
  // AC1: ManyToOne relation to Project
  // =========================================================================
  describe('Relations', () => {
    it('should have ManyToOne relation to Project', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === RailwayServiceEntity,
      );
      const projectRelation = relations.find(
        (r) => r.propertyName === 'project',
      );
      expect(projectRelation).toBeDefined();
      expect(projectRelation!.relationType).toBe('many-to-one');
    });

    it('should have JoinColumn on project_id', () => {
      const joinColumns = metadata.joinColumns.filter(
        (jc) => jc.target === RailwayServiceEntity,
      );
      const projectJoin = joinColumns.find(
        (jc) => jc.propertyName === 'project',
      );
      expect(projectJoin).toBeDefined();
      expect(projectJoin!.name).toBe('project_id');
    });
  });

  // =========================================================================
  // AC3: Indexes
  // =========================================================================
  describe('Indexes', () => {
    it('should have unique composite index on (projectId, railwayServiceId)', () => {
      const indexes = metadata.indices.filter(
        (i) => i.target === RailwayServiceEntity,
      );
      const uniqueIndex = indexes.find(
        (i) =>
          i.unique === true &&
          Array.isArray(i.columns) &&
          i.columns.includes('projectId') &&
          i.columns.includes('railwayServiceId'),
      );
      expect(uniqueIndex).toBeDefined();
    });

    it('should have index on projectId', () => {
      const indexes = metadata.indices.filter(
        (i) => i.target === RailwayServiceEntity,
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
        (i) => i.target === RailwayServiceEntity,
      );
      const workspaceIdIndex = indexes.find(
        (i) =>
          Array.isArray(i.columns) &&
          i.columns.length === 1 &&
          i.columns.includes('workspaceId'),
      );
      expect(workspaceIdIndex).toBeDefined();
    });
  });

  // =========================================================================
  // AC5: Cascade delete (entity-level onDelete option)
  // =========================================================================
  describe('Cascade delete behavior', () => {
    it('should have onDelete CASCADE on Project relation', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === RailwayServiceEntity,
      );
      const projectRelation = relations.find(
        (r) => r.propertyName === 'project',
      );
      expect(projectRelation).toBeDefined();
      expect(projectRelation!.options?.onDelete).toBe('CASCADE');
    });
  });

  // =========================================================================
  // AC7: Entity instantiation and CRUD shape
  // =========================================================================
  describe('Entity instantiation', () => {
    it('should be instantiable with all required fields', () => {
      const entity = new RailwayServiceEntity();
      entity.id = '550e8400-e29b-41d4-a716-446655440000';
      entity.projectId = '550e8400-e29b-41d4-a716-446655440001';
      entity.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      entity.railwayProjectId = 'railway-proj-123';
      entity.railwayServiceId = 'railway-svc-456';
      entity.name = 'api';
      entity.serviceType = RailwayServiceType.API;
      entity.status = RailwayServiceStatus.ACTIVE;
      entity.deployOrder = 1;
      entity.config = { buildCommand: 'npm run build' };
      entity.resourceInfo = { memory: '512MB' };
      entity.createdAt = new Date();
      entity.updatedAt = new Date();

      expect(entity.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(entity.projectId).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(entity.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(entity.railwayProjectId).toBe('railway-proj-123');
      expect(entity.railwayServiceId).toBe('railway-svc-456');
      expect(entity.name).toBe('api');
      expect(entity.serviceType).toBe(RailwayServiceType.API);
      expect(entity.status).toBe(RailwayServiceStatus.ACTIVE);
      expect(entity.deployOrder).toBe(1);
      expect(entity.config).toEqual({ buildCommand: 'npm run build' });
      expect(entity.resourceInfo).toEqual({ memory: '512MB' });
    });

    it('should allow nullable fields to be undefined', () => {
      const entity = new RailwayServiceEntity();
      entity.id = '550e8400-e29b-41d4-a716-446655440000';
      entity.projectId = '550e8400-e29b-41d4-a716-446655440001';
      entity.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      entity.railwayProjectId = 'railway-proj-123';
      entity.railwayServiceId = 'railway-svc-456';
      entity.name = 'postgres';
      entity.serviceType = RailwayServiceType.DATABASE;
      entity.status = RailwayServiceStatus.PROVISIONING;
      entity.deployOrder = 0;
      entity.config = {};
      entity.resourceInfo = {};

      expect(entity.deploymentUrl).toBeUndefined();
      expect(entity.customDomain).toBeUndefined();
      expect(entity.railwayEnvironmentId).toBeUndefined();
      expect(entity.githubRepo).toBeUndefined();
      expect(entity.sourceDirectory).toBeUndefined();
    });

    it('should allow setting nullable fields', () => {
      const entity = new RailwayServiceEntity();
      entity.deploymentUrl = 'https://myapp-api.up.railway.app';
      entity.customDomain = 'api.myapp.com';
      entity.railwayEnvironmentId = 'env-789';
      entity.githubRepo = 'specifiedcodes/devos-api';
      entity.sourceDirectory = 'packages/api';

      expect(entity.deploymentUrl).toBe('https://myapp-api.up.railway.app');
      expect(entity.customDomain).toBe('api.myapp.com');
      expect(entity.railwayEnvironmentId).toBe('env-789');
      expect(entity.githubRepo).toBe('specifiedcodes/devos-api');
      expect(entity.sourceDirectory).toBe('packages/api');
    });

    it('should support all service types', () => {
      const entity = new RailwayServiceEntity();

      entity.serviceType = RailwayServiceType.WEB;
      expect(entity.serviceType).toBe('web');

      entity.serviceType = RailwayServiceType.API;
      expect(entity.serviceType).toBe('api');

      entity.serviceType = RailwayServiceType.WORKER;
      expect(entity.serviceType).toBe('worker');

      entity.serviceType = RailwayServiceType.DATABASE;
      expect(entity.serviceType).toBe('database');

      entity.serviceType = RailwayServiceType.CACHE;
      expect(entity.serviceType).toBe('cache');

      entity.serviceType = RailwayServiceType.CRON;
      expect(entity.serviceType).toBe('cron');
    });

    it('should support all status values', () => {
      const entity = new RailwayServiceEntity();

      entity.status = RailwayServiceStatus.PROVISIONING;
      expect(entity.status).toBe('provisioning');

      entity.status = RailwayServiceStatus.ACTIVE;
      expect(entity.status).toBe('active');

      entity.status = RailwayServiceStatus.DEPLOYING;
      expect(entity.status).toBe('deploying');

      entity.status = RailwayServiceStatus.FAILED;
      expect(entity.status).toBe('failed');

      entity.status = RailwayServiceStatus.STOPPED;
      expect(entity.status).toBe('stopped');

      entity.status = RailwayServiceStatus.REMOVED;
      expect(entity.status).toBe('removed');
    });

    it('should store config as Record<string, unknown>', () => {
      const entity = new RailwayServiceEntity();
      entity.config = {
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        healthcheckPath: '/health',
        dockerfile: './Dockerfile',
      };

      expect(entity.config).toHaveProperty('buildCommand');
      expect(entity.config).toHaveProperty('startCommand');
      expect(entity.config).toHaveProperty('healthcheckPath');
      expect(entity.config).toHaveProperty('dockerfile');
    });

    it('should store resourceInfo as Record<string, unknown>', () => {
      const entity = new RailwayServiceEntity();
      entity.resourceInfo = {
        connectionString: 'placeholder',
        version: '15',
        size: '1GB',
      };

      expect(entity.resourceInfo).toHaveProperty('connectionString');
      expect(entity.resourceInfo).toHaveProperty('version');
      expect(entity.resourceInfo).toHaveProperty('size');
    });
  });

  // =========================================================================
  // AC4: Migration file
  // =========================================================================
  describe('Migration', () => {
    it('should have up method defined', () => {
      const migration = new CreateRailwayServicesTable1778000000000();
      expect(typeof migration.up).toBe('function');
    });

    it('should have down method defined', () => {
      const migration = new CreateRailwayServicesTable1778000000000();
      expect(typeof migration.down).toBe('function');
    });

    it('should be reversible (both up and down are async functions)', () => {
      const migration = new CreateRailwayServicesTable1778000000000();
      // Verify both methods return a Promise (are async)
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
      const migration = new CreateRailwayServicesTable1778000000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      expect(mockQueryRunner.createTable).toHaveBeenCalledTimes(1);
      const tableArg = mockQueryRunner.createTable.mock.calls[0][0];
      expect(tableArg.name).toBe('railway_services');
    });

    it('should create foreign keys for project_id and workspace_id in up()', async () => {
      const migration = new CreateRailwayServicesTable1778000000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      expect(mockQueryRunner.createForeignKey).toHaveBeenCalledTimes(2);

      // Verify project_id FK
      const fk1 = mockQueryRunner.createForeignKey.mock.calls[0][1];
      expect(fk1.columnNames).toContain('project_id');
      expect(fk1.referencedTableName).toBe('projects');
      expect(fk1.onDelete).toBe('CASCADE');

      // Verify workspace_id FK
      const fk2 = mockQueryRunner.createForeignKey.mock.calls[1][1];
      expect(fk2.columnNames).toContain('workspace_id');
      expect(fk2.referencedTableName).toBe('workspaces');
      expect(fk2.onDelete).toBe('CASCADE');
    });

    it('should create indexes in up()', async () => {
      const migration = new CreateRailwayServicesTable1778000000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      // Should create 3 indexes: unique composite, project_id, workspace_id
      expect(mockQueryRunner.createIndex).toHaveBeenCalledTimes(3);

      // Verify unique composite index
      const calls = mockQueryRunner.createIndex.mock.calls;
      const uniqueIdx = calls.find(
        (call: any[]) =>
          call[1].isUnique === true &&
          call[1].columnNames.includes('project_id') &&
          call[1].columnNames.includes('railway_service_id'),
      );
      expect(uniqueIdx).toBeDefined();

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
    });

    it('should drop table in down()', async () => {
      const migration = new CreateRailwayServicesTable1778000000000();
      const mockQueryRunner = {
        dropTable: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.down(mockQueryRunner);

      expect(mockQueryRunner.dropTable).toHaveBeenCalledWith('railway_services', true);
    });

    it('should create table with all required columns', async () => {
      const migration = new CreateRailwayServicesTable1778000000000();
      const mockQueryRunner = {
        createTable: jest.fn().mockResolvedValue(undefined),
        createForeignKey: jest.fn().mockResolvedValue(undefined),
        createIndex: jest.fn().mockResolvedValue(undefined),
      } as any;

      await migration.up(mockQueryRunner);

      const tableArg = mockQueryRunner.createTable.mock.calls[0][0];
      const columnNames = tableArg.columns.map((c: any) => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('project_id');
      expect(columnNames).toContain('workspace_id');
      expect(columnNames).toContain('railway_project_id');
      expect(columnNames).toContain('railway_service_id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('service_type');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('deployment_url');
      expect(columnNames).toContain('custom_domain');
      expect(columnNames).toContain('railway_environment_id');
      expect(columnNames).toContain('github_repo');
      expect(columnNames).toContain('source_directory');
      expect(columnNames).toContain('deploy_order');
      expect(columnNames).toContain('config');
      expect(columnNames).toContain('resource_info');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should set correct defaults on columns', async () => {
      const migration = new CreateRailwayServicesTable1778000000000();
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

      // Status default
      expect(findCol('status').default).toBe("'provisioning'");

      // Deploy order default
      expect(findCol('deploy_order').default).toBe(0);

      // JSONB defaults
      expect(findCol('config').default).toBe("'{}'");
      expect(findCol('resource_info').default).toBe("'{}'");

      // Timestamp defaults
      expect(findCol('created_at').default).toBe('CURRENT_TIMESTAMP');
      expect(findCol('updated_at').default).toBe('CURRENT_TIMESTAMP');
    });
  });
});
