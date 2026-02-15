/**
 * Neo4jService Unit Tests
 * Story 12.1: Graphiti/Neo4j Setup
 */

/* eslint-disable @typescript-eslint/no-require-imports */

// Define mock state using var so it won't be affected by TDZ with jest.mock hoisting
/* eslint-disable no-var */
var mockCommit = jest.fn().mockResolvedValue(undefined);
var mockRollback = jest.fn().mockResolvedValue(undefined);
var mockTransaction = { run: jest.fn(), commit: mockCommit, rollback: mockRollback };
var mockRun = jest.fn().mockResolvedValue({ records: [] });
var mockSessionClose = jest.fn().mockResolvedValue(undefined);
var mockBeginTransaction = jest.fn().mockReturnValue(mockTransaction);
var mockSession = { run: mockRun, close: mockSessionClose, beginTransaction: mockBeginTransaction };
var mockVerifyConnectivity = jest.fn().mockResolvedValue(undefined);
var mockDriverClose = jest.fn().mockResolvedValue(undefined);
var mockSessionFn = jest.fn().mockReturnValue(mockSession);
var mockDriverInstance = {
  session: mockSessionFn,
  verifyConnectivity: mockVerifyConnectivity,
  close: mockDriverClose,
};
var mockDriverFactory = jest.fn().mockReturnValue(mockDriverInstance);
var mockBasicAuth = jest.fn().mockReturnValue({ scheme: 'basic' });
/* eslint-enable no-var */

jest.mock('neo4j-driver', () => ({
  __esModule: true,
  default: {
    driver: mockDriverFactory,
    auth: {
      basic: mockBasicAuth,
    },
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Neo4jService } from './neo4j.service';

describe('Neo4jService', () => {
  let service: Neo4jService;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          NEO4J_URI: 'bolt://localhost:7687',
          NEO4J_USER: 'neo4j',
          NEO4J_PASSWORD: 'test_password',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Neo4jService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<Neo4jService>(Neo4jService);

    // Reset all mocks
    jest.clearAllMocks();
    // Re-setup default mock returns after clearAllMocks
    mockSessionFn.mockReturnValue(mockSession);
    mockBeginTransaction.mockReturnValue(mockTransaction);
    mockVerifyConnectivity.mockResolvedValue(undefined);
    mockDriverClose.mockResolvedValue(undefined);
    mockSessionClose.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue(undefined);
    mockRollback.mockResolvedValue(undefined);
    mockRun.mockResolvedValue({ records: [] });
    mockDriverFactory.mockReturnValue(mockDriverInstance);
    mockBasicAuth.mockReturnValue({ scheme: 'basic' });
  });

  describe('onModuleInit', () => {
    it('should create driver and verify connectivity', async () => {
      await service.onModuleInit();

      expect(mockDriverFactory).toHaveBeenCalledWith(
        'bolt://localhost:7687',
        expect.any(Object),
      );
      expect(mockVerifyConnectivity).toHaveBeenCalled();
      expect(service.isConnected()).toBe(true);
    });

    it('should create schema constraints and indexes', async () => {
      await service.onModuleInit();

      // 4 constraints + 5 indexes = 9 runQuery calls
      expect(mockRun).toHaveBeenCalledTimes(9);

      // Verify constraint queries
      expect(mockRun).toHaveBeenCalledWith(
        'CREATE CONSTRAINT episode_id IF NOT EXISTS FOR (e:Episode) REQUIRE e.id IS UNIQUE',
        undefined,
      );
      expect(mockRun).toHaveBeenCalledWith(
        'CREATE CONSTRAINT entity_ref_id IF NOT EXISTS FOR (er:EntityRef) REQUIRE er.id IS UNIQUE',
        undefined,
      );
      expect(mockRun).toHaveBeenCalledWith(
        'CREATE CONSTRAINT project_node_id IF NOT EXISTS FOR (p:ProjectNode) REQUIRE p.projectId IS UNIQUE',
        undefined,
      );
      expect(mockRun).toHaveBeenCalledWith(
        'CREATE CONSTRAINT workspace_node_id IF NOT EXISTS FOR (w:WorkspaceNode) REQUIRE w.workspaceId IS UNIQUE',
        undefined,
      );

      // Verify index queries
      expect(mockRun).toHaveBeenCalledWith(
        'CREATE INDEX episode_project IF NOT EXISTS FOR (e:Episode) ON (e.projectId)',
        undefined,
      );
      expect(mockRun).toHaveBeenCalledWith(
        'CREATE INDEX episode_workspace IF NOT EXISTS FOR (e:Episode) ON (e.workspaceId)',
        undefined,
      );
      expect(mockRun).toHaveBeenCalledWith(
        'CREATE INDEX episode_timestamp IF NOT EXISTS FOR (e:Episode) ON (e.timestamp)',
        undefined,
      );
      expect(mockRun).toHaveBeenCalledWith(
        'CREATE INDEX episode_type IF NOT EXISTS FOR (e:Episode) ON (e.episodeType)',
        undefined,
      );
      expect(mockRun).toHaveBeenCalledWith(
        'CREATE INDEX entity_ref_name IF NOT EXISTS FOR (er:EntityRef) ON (er.name)',
        undefined,
      );
    });

    it('should handle connection failure gracefully (logs warning, does not throw)', async () => {
      mockVerifyConnectivity.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(service.isConnected()).toBe(false);
    });

    it('should handle missing NEO4J_PASSWORD gracefully', async () => {
      mockConfigService.get = jest.fn((key: string) => {
        const config: Record<string, string | undefined> = {
          NEO4J_URI: 'bolt://localhost:7687',
          NEO4J_USER: 'neo4j',
          NEO4J_PASSWORD: undefined,
        };
        return config[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          Neo4jService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<Neo4jService>(Neo4jService);

      await svc.onModuleInit();
      expect(svc.isConnected()).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close driver if it exists', async () => {
      await service.onModuleInit();
      jest.clearAllMocks();

      await service.onModuleDestroy();

      expect(mockDriverClose).toHaveBeenCalled();
    });

    it('should not throw if driver does not exist', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('runQuery', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      jest.clearAllMocks();
      mockSessionFn.mockReturnValue(mockSession);
      mockRun.mockResolvedValue({ records: [{ get: jest.fn() }] });
      mockSessionClose.mockResolvedValue(undefined);
    });

    it('should execute Cypher query and return result', async () => {
      const expectedResult = { records: [{ get: jest.fn() }] };
      mockRun.mockResolvedValueOnce(expectedResult);

      const result = await service.runQuery('MATCH (n) RETURN n', {
        param: 'value',
      });

      expect(mockSessionFn).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalledWith('MATCH (n) RETURN n', {
        param: 'value',
      });
      expect(mockSessionClose).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should handle query errors and still close session', async () => {
      mockRun.mockRejectedValueOnce(new Error('Query error'));

      await expect(service.runQuery('INVALID CYPHER')).rejects.toThrow(
        'Query error',
      );
      expect(mockSessionClose).toHaveBeenCalled();
    });

    it('should throw if driver is not initialized', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          Neo4jService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const uninitializedService = module.get<Neo4jService>(Neo4jService);

      await expect(
        uninitializedService.runQuery('MATCH (n) RETURN n'),
      ).rejects.toThrow('Neo4j driver is not initialized');
    });
  });

  describe('runInTransaction', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      jest.clearAllMocks();
      mockSessionFn.mockReturnValue(mockSession);
      mockBeginTransaction.mockReturnValue(mockTransaction);
      mockCommit.mockResolvedValue(undefined);
      mockRollback.mockResolvedValue(undefined);
      mockSessionClose.mockResolvedValue(undefined);
    });

    it('should execute work in a transaction and commit on success', async () => {
      const work = jest.fn().mockResolvedValue('result');

      const result = await service.runInTransaction(work);

      expect(mockBeginTransaction).toHaveBeenCalled();
      expect(work).toHaveBeenCalledWith(mockTransaction);
      expect(mockCommit).toHaveBeenCalled();
      expect(mockSessionClose).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should roll back on error', async () => {
      const work = jest.fn().mockRejectedValue(new Error('Work failed'));

      await expect(service.runInTransaction(work)).rejects.toThrow(
        'Work failed',
      );

      expect(mockRollback).toHaveBeenCalled();
      expect(mockSessionClose).toHaveBeenCalled();
    });

    it('should throw if driver is not initialized', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          Neo4jService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const uninitializedService = module.get<Neo4jService>(Neo4jService);

      await expect(
        uninitializedService.runInTransaction(async () => 'result'),
      ).rejects.toThrow('Neo4j driver is not initialized');
    });
  });

  describe('verifyConnectivity', () => {
    it('should return true when connected', async () => {
      await service.onModuleInit();
      jest.clearAllMocks();
      mockVerifyConnectivity.mockResolvedValueOnce(undefined);

      const result = await service.verifyConnectivity();
      expect(result).toBe(true);
      expect(service.isConnected()).toBe(true);
    });

    it('should return false when disconnected', async () => {
      await service.onModuleInit();
      jest.clearAllMocks();
      mockVerifyConnectivity.mockRejectedValueOnce(
        new Error('Connection lost'),
      );

      const result = await service.verifyConnectivity();
      expect(result).toBe(false);
      expect(service.isConnected()).toBe(false);
    });

    it('should return false when driver is not initialized', async () => {
      const result = await service.verifyConnectivity();
      expect(result).toBe(false);
    });
  });

  describe('getDriver', () => {
    it('should return driver when initialized', async () => {
      await service.onModuleInit();
      expect(service.getDriver()).toBe(mockDriverInstance);
    });

    it('should return null when not initialized', () => {
      expect(service.getDriver()).toBeNull();
    });
  });
});
