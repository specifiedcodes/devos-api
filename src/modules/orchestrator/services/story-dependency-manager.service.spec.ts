/**
 * StoryDependencyManager Service Tests
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Tests for story dependency tracking and management.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StoryDependencyManagerService } from './story-dependency-manager.service';
import { RedisService } from '../../redis/redis.service';
import { CircularDependencyError } from '../interfaces/handoff.interfaces';

describe('StoryDependencyManagerService', () => {
  let service: StoryDependencyManagerService;
  let redisService: jest.Mocked<RedisService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  // In-memory store for Redis key-value pairs
  let redisStore: Record<string, string>;

  beforeEach(async () => {
    redisStore = {};

    const mockRedisService = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(redisStore[key] || null);
      }),
      set: jest.fn().mockImplementation((key: string, value: string) => {
        redisStore[key] = value;
        return Promise.resolve();
      }),
      scanKeys: jest.fn().mockImplementation((pattern: string) => {
        const prefix = pattern.replace('*', '');
        return Promise.resolve(
          Object.keys(redisStore).filter((k) => k.startsWith(prefix)),
        );
      }),
      del: jest.fn().mockImplementation((...keys: string[]) => {
        keys.forEach((k) => delete redisStore[k]);
        return Promise.resolve();
      }),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoryDependencyManagerService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<StoryDependencyManagerService>(
      StoryDependencyManagerService,
    );
    redisService = module.get(RedisService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addDependency', () => {
    it('should store dependency in Redis', async () => {
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-B',
        dependsOnStoryId: 'story-A',
      });

      expect(redisService.set).toHaveBeenCalled();

      // Verify the stored dependency
      const blocking = await service.getBlockingStories({
        workspaceId: 'ws-1',
        storyId: 'story-B',
      });
      expect(blocking).toContain('story-A');
    });

    it('should prevent circular dependencies', async () => {
      // A depends on B
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-A',
        dependsOnStoryId: 'story-B',
      });

      // B depends on A -> circular!
      await expect(
        service.addDependency({
          workspaceId: 'ws-1',
          storyId: 'story-B',
          dependsOnStoryId: 'story-A',
        }),
      ).rejects.toThrow(CircularDependencyError);
    });

    it('should allow multiple dependencies for the same story', async () => {
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-C',
        dependsOnStoryId: 'story-A',
      });
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-C',
        dependsOnStoryId: 'story-B',
      });

      const blocking = await service.getBlockingStories({
        workspaceId: 'ws-1',
        storyId: 'story-C',
      });
      expect(blocking).toContain('story-A');
      expect(blocking).toContain('story-B');
    });
  });

  describe('getBlockingStories', () => {
    it('should return empty array when no dependencies', async () => {
      const blocking = await service.getBlockingStories({
        workspaceId: 'ws-1',
        storyId: 'story-A',
      });

      expect(blocking).toEqual([]);
    });

    it('should return blocking story IDs', async () => {
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-B',
        dependsOnStoryId: 'story-A',
      });

      const blocking = await service.getBlockingStories({
        workspaceId: 'ws-1',
        storyId: 'story-B',
      });

      expect(blocking).toEqual(['story-A']);
    });

    it('should exclude completed stories', async () => {
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-B',
        dependsOnStoryId: 'story-A',
      });

      // Mark story-A as complete
      await service.markStoryComplete({
        workspaceId: 'ws-1',
        storyId: 'story-A',
      });

      const blocking = await service.getBlockingStories({
        workspaceId: 'ws-1',
        storyId: 'story-B',
      });

      expect(blocking).toEqual([]);
    });
  });

  describe('markStoryComplete', () => {
    it('should unblock dependent stories', async () => {
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-B',
        dependsOnStoryId: 'story-A',
      });

      const unblocked = await service.markStoryComplete({
        workspaceId: 'ws-1',
        storyId: 'story-A',
      });

      expect(unblocked).toContain('story-B');
    });

    it('should emit story_unblocked event', async () => {
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-B',
        dependsOnStoryId: 'story-A',
      });

      await service.markStoryComplete({
        workspaceId: 'ws-1',
        storyId: 'story-A',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'orchestrator:story_unblocked',
        expect.objectContaining({
          type: 'orchestrator:story_unblocked',
          workspaceId: 'ws-1',
          storyId: 'story-B',
        }),
      );
    });

    it('should return list of newly unblocked story IDs', async () => {
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-B',
        dependsOnStoryId: 'story-A',
      });
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-C',
        dependsOnStoryId: 'story-A',
      });

      const unblocked = await service.markStoryComplete({
        workspaceId: 'ws-1',
        storyId: 'story-A',
      });

      expect(unblocked).toContain('story-B');
      expect(unblocked).toContain('story-C');
    });

    it('should not unblock story with multiple incomplete dependencies', async () => {
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-C',
        dependsOnStoryId: 'story-A',
      });
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-C',
        dependsOnStoryId: 'story-B',
      });

      // Only complete story-A, story-B is still pending
      const unblocked = await service.markStoryComplete({
        workspaceId: 'ws-1',
        storyId: 'story-A',
      });

      // story-C should NOT be unblocked because story-B is still pending
      expect(unblocked).not.toContain('story-C');
    });
  });

  describe('getDependencyGraph', () => {
    it('should return complete dependency graph', async () => {
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-B',
        dependsOnStoryId: 'story-A',
      });
      await service.addDependency({
        workspaceId: 'ws-1',
        storyId: 'story-C',
        dependsOnStoryId: 'story-B',
      });

      const graph = await service.getDependencyGraph('ws-1');

      expect(graph.blockedStories).toContain('story-B');
      expect(graph.blockedStories).toContain('story-C');
      expect(graph.stories.size).toBeGreaterThanOrEqual(2);
    });
  });
});
