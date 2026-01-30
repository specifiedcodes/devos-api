import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { TenantConnectionService } from './tenant-connection.service';

describe('TenantConnectionService', () => {
  let service: TenantConnectionService;
  let mockDataSource: Partial<DataSource>;
  let queryMock: jest.Mock;

  beforeEach(async () => {
    queryMock = jest.fn();
    mockDataSource = {
      query: queryMock,
      isInitialized: true,
      options: {
        type: 'postgres',
        database: 'devos_db',
        poolSize: 100,
      } as any,
      driver: {
        master: {
          totalCount: 5,
        },
      } as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantConnectionService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TenantConnectionService>(TenantConnectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have DataSource injected', () => {
      expect(service['connection']).toBeDefined();
    });
  });

  describe('createWorkspaceSchema', () => {
    it('should create schema with correct naming convention', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      const expectedSchemaName = 'workspace_550e8400_e29b_41d4_a716_446655440000';

      queryMock.mockResolvedValue(undefined);

      const schemaName = await service.createWorkspaceSchema(workspaceId);

      expect(schemaName).toBe(expectedSchemaName);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining(`CREATE SCHEMA IF NOT EXISTS "${expectedSchemaName}"`),
      );
    });

    it('should validate UUID format before creating schema', async () => {
      const invalidWorkspaceId = 'not-a-uuid';

      await expect(service.createWorkspaceSchema(invalidWorkspaceId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createWorkspaceSchema(invalidWorkspaceId)).rejects.toThrow(
        'Invalid workspace ID format',
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('should reject SQL injection attempts in workspace ID', async () => {
      const maliciousId = '550e8400-e29b-41d4-a716-446655440000"; DROP TABLE users; --';

      await expect(service.createWorkspaceSchema(maliciousId)).rejects.toThrow(
        BadRequestException,
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('should use quoted identifiers to prevent SQL injection', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';

      queryMock.mockResolvedValue(undefined);

      await service.createWorkspaceSchema(workspaceId);

      // Verify queries use quoted identifiers
      const calls = queryMock.mock.calls;
      calls.forEach((call) => {
        if (call[0].includes('workspace_')) {
          expect(call[0]).toMatch(/"workspace_[a-f0-9_]+"/);
        }
      });
    });

    it('should set search_path to new schema during creation', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      const schemaName = 'workspace_550e8400_e29b_41d4_a716_446655440000';

      queryMock.mockResolvedValue(undefined);

      await service.createWorkspaceSchema(workspaceId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining(`SET search_path TO "${schemaName}"`),
      );
    });

    it('should reset search_path to public after creation', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';

      queryMock.mockResolvedValue(undefined);

      await service.createWorkspaceSchema(workspaceId);

      expect(queryMock).toHaveBeenCalledWith('SET search_path TO public');
    });

    it('should handle errors during schema creation', async () => {
      const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      const error = new Error('Database error');

      queryMock.mockRejectedValue(error);

      await expect(service.createWorkspaceSchema(workspaceId)).rejects.toThrow(
        'Database error while creating workspace schema',
      );
    });
  });

  describe('setWorkspaceContext', () => {
    it('should set search_path to specified schema with public fallback', async () => {
      const schemaName = 'workspace_550e8400_e29b_41d4_a716_446655440000';

      queryMock.mockResolvedValue(undefined);

      await service.setWorkspaceContext(schemaName);

      expect(queryMock).toHaveBeenCalledWith(
        `SET search_path TO "${schemaName}", public`,
      );
    });

    it('should validate schema name format before setting context', async () => {
      const invalidSchemaName = 'invalid-schema; DROP TABLE users;';

      await expect(service.setWorkspaceContext(invalidSchemaName)).rejects.toThrow(
        BadRequestException,
      );
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('should use quoted identifiers when setting search_path', async () => {
      const schemaName = 'workspace_550e8400_e29b_41d4_a716_446655440000';

      queryMock.mockResolvedValue(undefined);

      await service.setWorkspaceContext(schemaName);

      const call = queryMock.mock.calls[0][0];
      expect(call).toContain('"workspace_');
    });

    it('should handle errors when setting workspace context', async () => {
      const schemaName = 'workspace_550e8400_e29b_41d4_a716_446655440000';
      const error = new Error('Database connection error');

      queryMock.mockRejectedValue(error);

      await expect(service.setWorkspaceContext(schemaName)).rejects.toThrow(
        'Database error while setting workspace context',
      );
    });
  });

  describe('resetContext', () => {
    it('should reset search_path to public schema', async () => {
      queryMock.mockResolvedValue(undefined);

      await service.resetContext();

      expect(queryMock).toHaveBeenCalledWith('SET search_path TO public');
    });

    it('should handle errors when resetting context', async () => {
      const error = new Error('Reset failed');

      queryMock.mockRejectedValue(error);

      await expect(service.resetContext()).rejects.toThrow(
        'Database error while resetting context',
      );
    });
  });

  describe('schemaExists', () => {
    it('should return true when schema exists', async () => {
      const schemaName = 'workspace_550e8400_e29b_41d4_a716_446655440000';
      queryMock.mockResolvedValue([{ schema_name: schemaName }]);

      const exists = await service.schemaExists(schemaName);

      expect(exists).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('information_schema.schemata'),
        [schemaName],
      );
    });

    it('should return false when schema does not exist', async () => {
      const schemaName = 'workspace_550e8400_e29b_41d4_a716_446655440000';
      queryMock.mockResolvedValue([]);

      const exists = await service.schemaExists(schemaName);

      expect(exists).toBe(false);
    });

    it('should return false on database error', async () => {
      const schemaName = 'workspace_550e8400_e29b_41d4_a716_446655440000';
      queryMock.mockRejectedValue(new Error('Database error'));

      const exists = await service.schemaExists(schemaName);

      expect(exists).toBe(false);
    });

    it('should return false for invalid schema name format', async () => {
      const invalidSchemaName = 'invalid; DROP TABLE users;';

      // schemaExists catches all errors and returns false for safety
      const exists = await service.schemaExists(invalidSchemaName);

      expect(exists).toBe(false);
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status when database is accessible', async () => {
      queryMock.mockResolvedValue([{ result: 1 }]);

      const health = await service.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.database).toBe('devos_db');
      expect(health.poolSize).toBe(100);
      expect(health.activeConnections).toBe(5);
      expect(queryMock).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return unhealthy status when database is not accessible', async () => {
      queryMock.mockRejectedValue(new Error('Connection refused'));

      const health = await service.checkHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.database).toBe('devos_db');
      expect(health.poolSize).toBe(0);
      expect(health.activeConnections).toBe(0);
    });
  });

  describe('Connection Pool Management', () => {
    it('should use existing connection from DataSource', () => {
      expect(service['connection']).toBe(mockDataSource);
    });

    it('should verify DataSource is initialized', () => {
      expect(mockDataSource.isInitialized).toBe(true);
    });
  });

  describe('Schema Naming Convention', () => {
    it('should follow workspace_{uuid} pattern', async () => {
      const workspaceId = '12345678-1234-1234-1234-123456789012';

      queryMock.mockResolvedValue(undefined);

      const schemaName = await service.createWorkspaceSchema(workspaceId);

      expect(schemaName).toMatch(/^workspace_[a-z0-9_]+$/);
      expect(schemaName.startsWith('workspace_')).toBe(true);
    });

    it('should create unique schema names for different workspaces', async () => {
      const workspaceId1 = '550e8400-e29b-41d4-a716-446655440000';
      const workspaceId2 = '660e8400-e29b-41d4-a716-446655440001';

      queryMock.mockResolvedValue(undefined);

      const schema1 = await service.createWorkspaceSchema(workspaceId1);
      const schema2 = await service.createWorkspaceSchema(workspaceId2);

      expect(schema1).not.toBe(schema2);
    });
  });
});
