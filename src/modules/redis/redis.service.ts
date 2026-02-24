import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as crypto from 'crypto';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly BLACKLIST_PREFIX = 'blacklist:token:';
  private readonly TEMP_TOKEN_PREFIX = '2fa_temp:';
  private readonly TEMP_TOKEN_TTL = 300; // 5 minutes in seconds
  private isConnected = false;

  constructor(private configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true, // Don't auto-connect, we'll do it in onModuleInit
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected successfully');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis connection error', error);
      this.isConnected = false;
    });
  }

  /**
   * Validate Redis connection on module initialization
   * Throws error if Redis is required but unavailable
   */
  async onModuleInit() {
    try {
      await this.client.connect();
      const pingResult = await this.client.ping();
      if (pingResult !== 'PONG') {
        throw new Error('Redis ping failed');
      }
      this.isConnected = true;
      this.logger.log('Redis module initialized and connection verified');
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection', error);
      // In development, warn but don't crash. In production, crash.
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'Redis connection failed. Redis is required for token blacklist in production.',
        );
      } else {
        this.logger.warn(
          'Redis connection failed. Token blacklist will not work. This is acceptable in development.',
        );
      }
    }
  }

  /**
   * Blacklist a token with TTL matching its expiry
   * @param token - The token to blacklist (JWT or JTI)
   * @param ttlSeconds - Time to live in seconds
   */
  async blacklistToken(token: string, ttlSeconds: number): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot blacklist token');
      return;
    }
    try {
      const key = `${this.BLACKLIST_PREFIX}${token}`;
      await this.client.setex(key, ttlSeconds, '1');
      this.logger.debug(`Token blacklisted with TTL ${ttlSeconds}s`);
    } catch (error) {
      this.logger.error('Failed to blacklist token', error);
      // Don't throw - logout should succeed even if blacklist fails
    }
  }

  /**
   * Check if a token is blacklisted
   * @param token - The token to check (JWT or JTI)
   * @returns true if token is blacklisted, false otherwise
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot check token blacklist');
      return false; // Fail open in development, fail closed in production
    }
    try {
      const key = `${this.BLACKLIST_PREFIX}${token}`;
      const result = await this.client.get(key);
      return result === '1';
    } catch (error) {
      this.logger.error('Failed to check token blacklist', error);
      return false; // Fail open to prevent blocking legitimate users
    }
  }

  /**
   * Health check for Redis connection
   * @returns true if Redis is connected and responsive
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a temporary 2FA verification token
   * @param userId - User ID requiring 2FA
   * @param metadata - Additional context (IP, user-agent, timestamp)
   * @returns Secure random token string (64 hex characters)
   */
  async createTempToken(
    userId: string,
    metadata: { ip_address: string; user_agent: string; created_at: string },
  ): Promise<string> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot create temp token');
      throw new Error('Redis connection unavailable');
    }

    try {
      // Generate cryptographically secure random token
      const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars

      // Store in Redis with metadata
      const key = `${this.TEMP_TOKEN_PREFIX}${token}`;
      const value = JSON.stringify({
        user_id: userId,
        ...metadata,
      });

      await this.client.setex(key, this.TEMP_TOKEN_TTL, value);

      this.logger.debug(
        `Created temp token for user: ${userId}, expires in ${this.TEMP_TOKEN_TTL}s`,
      );

      return token;
    } catch (error) {
      this.logger.error('Failed to create temp token', error);
      throw new Error('Failed to create temporary verification token');
    }
  }

  /**
   * Validates and retrieves temp token data
   * @param token - Token to validate
   * @returns Token metadata or null if expired/invalid
   */
  async validateTempToken(token: string): Promise<{
    user_id: string;
    ip_address: string;
    user_agent: string;
    created_at: string;
  } | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot validate temp token');
      return null;
    }

    try {
      const key = `${this.TEMP_TOKEN_PREFIX}${token}`;
      const value = await this.client.get(key);

      if (!value) {
        this.logger.warn(
          `Temp token not found or expired: ${token.substring(0, 8)}...`,
        );
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      this.logger.error('Failed to validate temp token', error);
      return null;
    }
  }

  /**
   * Deletes temp token after successful verification
   * @param token - Token to delete
   */
  async deleteTempToken(token: string): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot delete temp token');
      return;
    }

    try {
      const key = `${this.TEMP_TOKEN_PREFIX}${token}`;
      await this.client.del(key);
      this.logger.debug(`Deleted temp token: ${token.substring(0, 8)}...`);
    } catch (error) {
      this.logger.error('Failed to delete temp token', error);
      // Don't throw - verification already succeeded
    }
  }

  /**
   * Gets remaining TTL for temp token
   * @param token - Token to check
   * @returns Remaining seconds or -1 if expired/not found
   */
  async getTempTokenTTL(token: string): Promise<number> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot get temp token TTL');
      return -1;
    }

    try {
      const key = `${this.TEMP_TOKEN_PREFIX}${token}`;
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error('Failed to get temp token TTL', error);
      return -1;
    }
  }

  /**
   * Atomic set-if-not-exists with TTL (Story 11.1 - Distributed locking)
   * Uses Redis SET key value EX ttl NX for atomic lock acquisition.
   * @param key - Redis key
   * @param value - Value to store
   * @param ttlSeconds - Time to live in seconds
   * @returns 'OK' if the key was set, null if the key already existed
   */
  async setnx(key: string, value: string, ttlSeconds: number): Promise<string | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot setnx key');
      return null;
    }
    try {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result;
    } catch (error) {
      this.logger.error(`Failed to setnx key ${key}`, error);
      return null;
    }
  }

  /**
   * Generic set operation with TTL (Story 1.9)
   * @param key - Redis key
   * @param value - Value to store
   * @param ttlSeconds - Time to live in seconds
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot set key');
      return;
    }
    try {
      await this.client.setex(key, ttlSeconds, value);
    } catch (error) {
      this.logger.error(`Failed to set key ${key}`, error);
    }
  }

  /**
   * Generic get operation (Story 1.9)
   * @param key - Redis key
   * @returns Value or null if not found
   */
  async get(key: string): Promise<string | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot get key');
      return null;
    }
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(`Failed to get key ${key}`, error);
      return null;
    }
  }

  /**
   * Find keys matching a pattern (Story 1.9)
   * WARNING: Uses KEYS command which blocks Redis. For production, use scanKeys() instead.
   * @param pattern - Redis key pattern (e.g., 'session:user123:*')
   * @returns Array of matching keys
   * @deprecated Use scanKeys() for production code to avoid blocking Redis
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot query keys');
      return [];
    }
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this.logger.error(`Failed to query keys with pattern ${pattern}`, error);
      return [];
    }
  }

  /**
   * Find keys matching a pattern using SCAN (Story 10.6)
   * Non-blocking alternative to keys() for production use
   * @param pattern - Redis key pattern (e.g., 'quiet-hours:user123:*')
   * @param count - Hint for number of keys to return per iteration (default: 100)
   * @returns Array of matching keys
   */
  async scanKeys(pattern: string, count: number = 100): Promise<string[]> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot scan keys');
      return [];
    }
    try {
      const allKeys: string[] = [];
      let cursor = '0';

      do {
        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          count,
        );
        cursor = newCursor;
        allKeys.push(...keys);
      } while (cursor !== '0');

      return allKeys;
    } catch (error) {
      this.logger.error(`Failed to scan keys with pattern ${pattern}`, error);
      return [];
    }
  }

  /**
   * Delete one or more keys (Story 1.9)
   * @param keys - Keys to delete
   */
  async del(...keys: string[]): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot delete keys');
      return;
    }
    try {
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      this.logger.error(`Failed to delete keys`, error);
    }
  }

  /**
   * Increment a key by a value (Story 3.3 - Real-time cost tracking)
   * @param key - Redis key
   * @param value - Value to increment by (default: 1)
   * @returns New value after increment
   */
  async increment(key: string, value: number = 1): Promise<number | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot increment key');
      return null;
    }
    try {
      // Use INCRBYFLOAT for decimal values (cost tracking)
      const newValue = await this.client.incrbyfloat(key, value);
      return parseFloat(newValue);
    } catch (error) {
      this.logger.error(`Failed to increment key ${key}`, error);
      return null;
    }
  }

  /**
   * Set expiration on a key (Story 3.3 - Real-time cost tracking)
   * @param key - Redis key
   * @param ttlSeconds - Time to live in seconds
   * @returns true if expiration was set successfully
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot set expiration');
      return false;
    }
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to set expiration on key ${key}`, error);
      return false;
    }
  }

  /**
   * Publish a message to a Redis channel (Story 7.2 - Real-time Kanban updates)
   * @param channel - Redis channel name
   * @param message - Message to publish (will be serialized as-is)
   * @returns Number of subscribers that received the message, or null on failure
   */
  async publish(channel: string, message: string): Promise<number | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot publish message');
      return null;
    }
    try {
      const result = await this.client.publish(channel, message);
      return result;
    } catch (error) {
      this.logger.error(`Failed to publish to channel ${channel}`, error);
      return null;
    }
  }

  /**
   * Add element to sorted set with score (Story 9.8 - Metrics time series)
   * @param key - Redis sorted set key
   * @param score - Score for ordering (typically timestamp)
   * @param member - Member value
   * @returns Number of new elements added
   */
  async zadd(key: string, score: number, member: string): Promise<number | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot zadd');
      return null;
    }
    try {
      return await this.client.zadd(key, score, member);
    } catch (error) {
      this.logger.error(`Failed to zadd to ${key}`, error);
      return null;
    }
  }

  /**
   * Get elements from sorted set by score range (Story 9.8 - Metrics time series)
   * @param key - Redis sorted set key
   * @param min - Minimum score (use '-inf' for no minimum)
   * @param max - Maximum score (use '+inf' for no maximum)
   * @returns Array of members in the score range
   */
  async zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot zrangebyscore');
      return [];
    }
    try {
      return await this.client.zrangebyscore(key, min, max);
    } catch (error) {
      this.logger.error(`Failed to zrangebyscore from ${key}`, error);
      return [];
    }
  }

  /**
   * Remove elements from sorted set by score range (Story 9.8 - Metrics time series)
   * @param key - Redis sorted set key
   * @param min - Minimum score
   * @param max - Maximum score
   * @returns Number of elements removed
   */
  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot zremrangebyscore');
      return null;
    }
    try {
      return await this.client.zremrangebyscore(key, min, max);
    } catch (error) {
      this.logger.error(`Failed to zremrangebyscore from ${key}`, error);
      return null;
    }
  }

  /**
   * Get the number of members in a sorted set (Story 11.8 - Handoff Queue)
   * @param key - Redis sorted set key
   * @returns Number of members in the sorted set
   */
  async zcard(key: string): Promise<number> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot zcard');
      return 0;
    }
    try {
      return await this.client.zcard(key);
    } catch (error) {
      this.logger.error(`Failed to zcard for ${key}`, error);
      return 0;
    }
  }

  /**
   * Remove specific members from a sorted set (Story 11.8 - Handoff Queue)
   * @param key - Redis sorted set key
   * @param members - Members to remove
   * @returns Number of elements removed
   */
  async zrem(key: string, ...members: string[]): Promise<number | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot zrem');
      return null;
    }
    try {
      return await this.client.zrem(key, ...members);
    } catch (error) {
      this.logger.error(`Failed to zrem from ${key}`, error);
      return null;
    }
  }

  /**
   * Remove elements from sorted set by rank range (Story 15.7 - WebSocket buffer limits)
   * Rank 0 is the element with the lowest score (oldest).
   * @param key - Redis sorted set key
   * @param start - Start rank (inclusive, 0-based)
   * @param stop - Stop rank (inclusive, negative values count from the end)
   * @returns Number of elements removed
   */
  async zremrangebyrank(key: string, start: number, stop: number): Promise<number | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot zremrangebyrank');
      return null;
    }
    try {
      return await this.client.zremrangebyrank(key, start, stop);
    } catch (error) {
      this.logger.error(`Failed to zremrangebyrank from ${key}`, error);
      return null;
    }
  }

  /**
   * Get members of a sorted set in reverse order (highest score first).
   * Story 20.4 - IP Allowlisting blocked attempts retrieval
   * @param key - Redis sorted set key
   * @param start - Start rank (inclusive, 0-based)
   * @param stop - Stop rank (inclusive)
   * @returns Array of members in reverse score order
   */
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot zrevrange');
      return [];
    }
    try {
      return await this.client.zrevrange(key, start, stop);
    } catch (error) {
      this.logger.error(`Failed to zrevrange from ${key}`, error);
      return [];
    }
  }

  /**
   * Execute Redis INFO command (Story 14.1 - Prometheus metrics)
   * Returns raw Redis INFO string for metrics collection
   * @returns Redis INFO response string or null on failure
   */
  async getInfo(): Promise<string | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, cannot get info');
      return null;
    }
    try {
      return await this.client.info();
    } catch (error) {
      this.logger.error('Failed to get Redis info', error);
      return null;
    }
  }

  /**
   * Returns the Redis connection status (Story 14.1 - Prometheus metrics)
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }
}
