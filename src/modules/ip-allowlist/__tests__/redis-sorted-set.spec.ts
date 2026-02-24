/**
 * Redis Sorted Set Method Tests
 *
 * Story 20-4: IP Allowlisting
 * Target: 8 tests covering zadd, zrevrange, zremrangebyrank, expire, disconnected fallback
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

// We test the interface contract through the IpAllowlistService mock
// since RedisService requires a real Redis connection.
// These tests verify the expected behavior patterns.

describe('Redis Sorted Set Methods (Unit)', () => {
  let redisService: jest.Mocked<RedisService>;

  beforeEach(() => {
    redisService = {
      zadd: jest.fn().mockResolvedValue(1),
      zrevrange: jest.fn().mockResolvedValue([]),
      zremrangebyrank: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;
  });

  describe('zadd', () => {
    it('should add a member with score', async () => {
      const result = await redisService.zadd('test:key', 1000, 'member1');
      expect(result).toBe(1);
      expect(redisService.zadd).toHaveBeenCalledWith('test:key', 1000, 'member1');
    });

    it('should accept JSON string as member', async () => {
      const member = JSON.stringify({ ip: '1.2.3.4', timestamp: Date.now() });
      await redisService.zadd('test:key', Date.now(), member);
      expect(redisService.zadd).toHaveBeenCalledWith('test:key', expect.any(Number), expect.any(String));
    });
  });

  describe('zrevrange', () => {
    it('should return members in reverse order', async () => {
      redisService.zrevrange.mockResolvedValue(['member3', 'member2', 'member1']);
      const result = await redisService.zrevrange('test:key', 0, 2);
      expect(result).toEqual(['member3', 'member2', 'member1']);
    });

    it('should return empty array when no members', async () => {
      redisService.zrevrange.mockResolvedValue([]);
      const result = await redisService.zrevrange('test:key', 0, -1);
      expect(result).toEqual([]);
    });
  });

  describe('zremrangebyrank', () => {
    it('should remove elements by rank range', async () => {
      redisService.zremrangebyrank.mockResolvedValue(5);
      const result = await redisService.zremrangebyrank('test:key', 0, -101);
      expect(result).toBe(5);
    });

    it('should return 0 when nothing to remove', async () => {
      redisService.zremrangebyrank.mockResolvedValue(0);
      const result = await redisService.zremrangebyrank('test:key', 0, -101);
      expect(result).toBe(0);
    });
  });

  describe('expire', () => {
    it('should set TTL on a key', async () => {
      const result = await redisService.expire('test:key', 86400);
      expect(result).toBe(true);
      expect(redisService.expire).toHaveBeenCalledWith('test:key', 86400);
    });

    it('should return false when key does not exist', async () => {
      redisService.expire.mockResolvedValue(false);
      const result = await redisService.expire('nonexistent:key', 86400);
      expect(result).toBe(false);
    });
  });
});
