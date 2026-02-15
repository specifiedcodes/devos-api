/**
 * GraphitiService Unit Tests
 * Story 12.1: Graphiti/Neo4j Setup
 */
import { Test, TestingModule } from '@nestjs/testing';
import { GraphitiService } from './graphiti.service';
import { Neo4jService } from './neo4j.service';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

describe('GraphitiService', () => {
  let service: GraphitiService;
  let mockNeo4jService: Partial<Neo4jService>;

  const createMockResult = (records: Record<string, unknown>[] = []) => ({
    records: records.map((record) => ({
      get: jest.fn((key: string) => record[key]),
    })),
  });

  beforeEach(async () => {
    mockNeo4jService = {
      runQuery: jest.fn().mockResolvedValue(createMockResult()),
      runInTransaction: jest.fn(),
      verifyConnectivity: jest.fn().mockResolvedValue(true),
      isConnected: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GraphitiService,
        { provide: Neo4jService, useValue: mockNeo4jService },
      ],
    }).compile();

    service = module.get<GraphitiService>(GraphitiService);
    jest.clearAllMocks();
    // Re-setup uuid mock after clearAllMocks
    const { v4 } = require('uuid');
    v4.mockReturnValue('test-uuid-1234');
  });

  describe('addEpisode', () => {
    it('should create Episode node with correct properties in Neo4j', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([
          {
            e: {
              properties: {
                id: 'test-uuid-1234',
                projectId: 'proj-1',
                workspaceId: 'ws-1',
              },
            },
          },
        ]),
      );

      const result = await service.addEpisode({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        agentType: 'dev',
        episodeType: 'decision',
        content: 'Chose React over Vue',
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (e:Episode'),
        expect.objectContaining({
          id: 'test-uuid-1234',
          projectId: 'proj-1',
          workspaceId: 'ws-1',
          agentType: 'dev',
          episodeType: 'decision',
          content: 'Chose React over Vue',
        }),
      );

      expect(result.id).toBe('test-uuid-1234');
      expect(result.projectId).toBe('proj-1');
      expect(result.workspaceId).toBe('ws-1');
      expect(result.episodeType).toBe('decision');
    });

    it('should generate UUID and set timestamp', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([{ e: { properties: {} } }]),
      );

      const beforeTime = new Date();
      const result = await service.addEpisode({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        agentType: 'dev',
        episodeType: 'fact',
        content: 'Test fact',
      });
      const afterTime = new Date();

      expect(result.id).toBe('test-uuid-1234');
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(
        afterTime.getTime(),
      );
    });

    it('should create BELONGS_TO relationship to ProjectNode', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([{ e: { properties: {} } }]),
      );

      await service.addEpisode({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        agentType: 'dev',
        episodeType: 'fact',
        content: 'Test',
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (p:ProjectNode {projectId: $projectId})'),
        expect.any(Object),
      );
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (e)-[:BELONGS_TO]->(p)'),
        expect.any(Object),
      );
    });

    it('should create entity references and REFERENCES relationships when entities provided', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([]),
      );

      await service.addEpisode({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        agentType: 'dev',
        episodeType: 'decision',
        content: 'Chose React',
        entities: ['React', 'Vue'],
      });

      // Should have calls for: addEpisode (1) + batch entity creation (1) = 2
      expect(mockNeo4jService.runQuery).toHaveBeenCalledTimes(2);
      // Verify batch entity query includes UNWIND and MERGE for EntityRef
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UNWIND $entityNames AS entityName'),
        expect.objectContaining({
          episodeId: 'test-uuid-1234',
          entityNames: ['React', 'Vue'],
          projectId: 'proj-1',
          workspaceId: 'ws-1',
        }),
      );
    });

    it('should set default confidence to 0.5 when not provided', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([{ e: { properties: {} } }]),
      );

      const result = await service.addEpisode({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        agentType: 'dev',
        episodeType: 'fact',
        content: 'Test',
      });

      expect(result.confidence).toBe(0.5);
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ confidence: 0.5 }),
      );
    });

    it('should use provided confidence when given', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([{ e: { properties: {} } }]),
      );

      const result = await service.addEpisode({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        agentType: 'dev',
        episodeType: 'fact',
        content: 'Test',
        confidence: 0.9,
      });

      expect(result.confidence).toBe(0.9);
    });
  });

  describe('getEpisode', () => {
    it('should return episode by ID', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([
          {
            e: {
              properties: {
                id: 'ep-1',
                projectId: 'proj-1',
                workspaceId: 'ws-1',
                storyId: null,
                agentType: 'dev',
                timestamp: '2026-01-15T10:00:00.000Z',
                episodeType: 'decision',
                content: 'Test decision',
                confidence: 0.8,
                metadata: '{}',
              },
            },
            entityNames: ['React', 'TypeScript'],
          },
        ]),
      );

      const result = await service.getEpisode('ep-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('ep-1');
      expect(result!.projectId).toBe('proj-1');
      expect(result!.entities).toEqual(['React', 'TypeScript']);
      expect(result!.episodeType).toBe('decision');
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (e:Episode {id: $episodeId})'),
        { episodeId: 'ep-1' },
      );
    });

    it('should return null for non-existent episode', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([]),
      );

      const result = await service.getEpisode('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('searchEpisodes', () => {
    const mockEpisodeRecord = {
      e: {
        properties: {
          id: 'ep-1',
          projectId: 'proj-1',
          workspaceId: 'ws-1',
          storyId: null,
          agentType: 'dev',
          timestamp: '2026-01-15T10:00:00.000Z',
          episodeType: 'decision',
          content: 'Test',
          confidence: 0.8,
          metadata: '{}',
        },
      },
      entityNames: [],
    };

    it('should filter by projectId and workspaceId (workspace isolation)', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([mockEpisodeRecord]),
      );

      await service.searchEpisodes({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('e.projectId = $projectId'),
        expect.objectContaining({
          projectId: 'proj-1',
          workspaceId: 'ws-1',
        }),
      );
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('e.workspaceId = $workspaceId'),
        expect.any(Object),
      );
    });

    it('should filter by episodeType', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([mockEpisodeRecord]),
      );

      await service.searchEpisodes({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        types: ['decision', 'fact'],
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('e.episodeType IN $types'),
        expect.objectContaining({ types: ['decision', 'fact'] }),
      );
    });

    it('should filter by time range (since parameter)', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([mockEpisodeRecord]),
      );

      const since = new Date('2026-01-01T00:00:00Z');
      await service.searchEpisodes({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        since,
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('e.timestamp >= datetime($since)'),
        expect.objectContaining({ since: since.toISOString() }),
      );
    });

    it('should limit results (maxResults parameter)', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([mockEpisodeRecord]),
      );

      await service.searchEpisodes({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        maxResults: 5,
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $maxResults'),
        expect.objectContaining({
          maxResults: expect.objectContaining({ low: 5, high: 0 }),
        }),
      );
    });

    it('should use default maxResults of 10', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([]),
      );

      await service.searchEpisodes({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxResults: expect.objectContaining({ low: 10, high: 0 }),
        }),
      );
    });

    it('should filter by entity names', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([mockEpisodeRecord]),
      );

      await service.searchEpisodes({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
        entityNames: ['React', 'TypeScript'],
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('er.name IN $entityNames'),
        expect.objectContaining({ entityNames: ['React', 'TypeScript'] }),
      );
    });

    it('should return mapped episodes', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([mockEpisodeRecord]),
      );

      const results = await service.searchEpisodes({
        projectId: 'proj-1',
        workspaceId: 'ws-1',
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ep-1');
      expect(results[0].episodeType).toBe('decision');
    });
  });

  describe('deleteEpisode', () => {
    it('should remove episode node and its relationships', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([{ deleted: 1 }]),
      );

      const result = await service.deleteEpisode('ep-1');

      expect(result).toBe(true);
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE e'),
        { episodeId: 'ep-1' },
      );
    });

    it('should return false when episode not found', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([{ deleted: 0 }]),
      );

      const result = await service.deleteEpisode('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getProjectEpisodeCount', () => {
    it('should return correct count', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([{ count: 42 }]),
      );

      const result = await service.getProjectEpisodeCount('proj-1');

      expect(result).toBe(42);
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('count(e) as count'),
        { projectId: 'proj-1' },
      );
    });
  });

  describe('addEntityRef', () => {
    it('should create EntityRef node with correct properties', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([
          {
            er: {
              properties: {
                id: 'test-uuid-1234',
                name: 'React',
                entityType: 'library',
                projectId: 'proj-1',
                workspaceId: 'ws-1',
                metadata: '{}',
              },
            },
          },
        ]),
      );

      const result = await service.addEntityRef({
        name: 'React',
        entityType: 'library',
        projectId: 'proj-1',
        workspaceId: 'ws-1',
      });

      expect(result.name).toBe('React');
      expect(result.entityType).toBe('library');
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (er:EntityRef'),
        expect.objectContaining({
          name: 'React',
          entityType: 'library',
          projectId: 'proj-1',
          workspaceId: 'ws-1',
        }),
      );
    });
  });

  describe('linkEpisodeToEntity', () => {
    it('should create REFERENCES relationship', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult(),
      );

      await service.linkEpisodeToEntity('ep-1', 'entity-1');

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (e)-[:REFERENCES]->(er)'),
        { episodeId: 'ep-1', entityId: 'entity-1' },
      );
    });
  });

  describe('getEntityEpisodes', () => {
    it('should return episodes linked to entity', async () => {
      (mockNeo4jService.runQuery as jest.Mock).mockResolvedValue(
        createMockResult([
          {
            e: {
              properties: {
                id: 'ep-1',
                projectId: 'proj-1',
                workspaceId: 'ws-1',
                storyId: null,
                agentType: 'dev',
                timestamp: '2026-01-15T10:00:00.000Z',
                episodeType: 'decision',
                content: 'Test',
                confidence: 0.8,
                metadata: '{}',
              },
            },
            entityNames: ['React'],
          },
        ]),
      );

      const results = await service.getEntityEpisodes('entity-1');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('ep-1');
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (e:Episode)-[:REFERENCES]->(er:EntityRef {id: $entityId})',
        ),
        { entityId: 'entity-1' },
      );
    });
  });
});
