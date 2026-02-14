import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';

/**
 * User presence status
 * Story 9.10: Multi-User Chat
 */
export enum PresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  DO_NOT_DISTURB = 'dnd',
  OFFLINE = 'offline',
}

/**
 * User presence data structure
 */
export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastActiveAt: Date;
  statusMessage?: string | null;
  currentRoomId?: string | null;
  socketId?: string;
}

/**
 * Presence update event
 */
export interface PresenceUpdateEvent {
  userId: string;
  status: PresenceStatus;
  lastActiveAt: string;
  statusMessage?: string;
}

/**
 * PresenceService
 * Story 9.10: Multi-User Chat
 *
 * Handles real-time user presence tracking with Redis
 */
@Injectable()
export class PresenceService implements OnModuleInit {
  private readonly logger = new Logger(PresenceService.name);
  private redis: Redis;

  // TTL for presence data (90 seconds - heartbeat is 60 seconds)
  private static readonly PRESENCE_TTL = 90;
  // Threshold for automatic away status (5 minutes)
  private static readonly AWAY_THRESHOLD_MS = 5 * 60 * 1000;
  // Threshold for automatic offline status (30 minutes)
  private static readonly OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      keyPrefix: 'devos:presence:',
    });
  }

  async onModuleInit() {
    this.logger.log('PresenceService initialized');
  }

  /**
   * Get Redis key for user presence
   */
  private getUserKey(workspaceId: string, userId: string): string {
    return `${workspaceId}:${userId}`;
  }

  /**
   * Get Redis key for room presence
   */
  private getRoomKey(roomId: string): string {
    return `room:${roomId}`;
  }

  /**
   * Set user presence status
   */
  async setPresence(
    workspaceId: string,
    userId: string,
    status: PresenceStatus,
    options: {
      statusMessage?: string;
      currentRoomId?: string;
      socketId?: string;
    } = {},
  ): Promise<void> {
    const key = this.getUserKey(workspaceId, userId);

    const presenceData: Record<string, string> = {
      userId,
      status,
      lastActiveAt: new Date().toISOString(),
    };

    if (options.statusMessage) {
      presenceData.statusMessage = options.statusMessage;
    }
    if (options.currentRoomId) {
      presenceData.currentRoomId = options.currentRoomId;
    }
    if (options.socketId) {
      presenceData.socketId = options.socketId;
    }

    await this.redis.hmset(key, presenceData);
    await this.redis.expire(key, PresenceService.PRESENCE_TTL);

    this.logger.debug(`Set presence for user ${userId} in workspace ${workspaceId}: ${status}`);
  }

  /**
   * Get user presence
   */
  async getPresence(workspaceId: string, userId: string): Promise<UserPresence | null> {
    const key = this.getUserKey(workspaceId, userId);
    const data = await this.redis.hgetall(key);

    if (!data || !data.userId) {
      return {
        userId,
        status: PresenceStatus.OFFLINE,
        lastActiveAt: new Date(),
      };
    }

    return {
      userId: data.userId,
      status: data.status as PresenceStatus,
      lastActiveAt: new Date(data.lastActiveAt),
      statusMessage: data.statusMessage || null,
      currentRoomId: data.currentRoomId || null,
      socketId: data.socketId,
    };
  }

  /**
   * Get presence for multiple users
   */
  async getPresenceMany(
    workspaceId: string,
    userIds: string[],
  ): Promise<Map<string, UserPresence>> {
    const presenceMap = new Map<string, UserPresence>();

    // Use pipeline for efficient bulk retrieval
    const pipeline = this.redis.pipeline();

    for (const userId of userIds) {
      const key = this.getUserKey(workspaceId, userId);
      pipeline.hgetall(key);
    }

    const results = await pipeline.exec();

    if (results) {
      userIds.forEach((userId, index) => {
        const [err, data] = results[index];
        if (!err && data && typeof data === 'object' && (data as Record<string, string>).userId) {
          const d = data as Record<string, string>;
          presenceMap.set(userId, {
            userId: d.userId,
            status: d.status as PresenceStatus,
            lastActiveAt: new Date(d.lastActiveAt),
            statusMessage: d.statusMessage || null,
            currentRoomId: d.currentRoomId || null,
            socketId: d.socketId,
          });
        } else {
          presenceMap.set(userId, {
            userId,
            status: PresenceStatus.OFFLINE,
            lastActiveAt: new Date(),
          });
        }
      });
    }

    return presenceMap;
  }

  /**
   * Update heartbeat (refresh TTL and update lastActiveAt)
   */
  async heartbeat(
    workspaceId: string,
    userId: string,
    currentRoomId?: string,
  ): Promise<void> {
    const key = this.getUserKey(workspaceId, userId);
    const exists = await this.redis.exists(key);

    if (exists) {
      // Update lastActiveAt and refresh TTL
      await this.redis.hset(key, 'lastActiveAt', new Date().toISOString());
      if (currentRoomId) {
        await this.redis.hset(key, 'currentRoomId', currentRoomId);
        // Refresh room presence TTL to prevent memory leak
        const roomKey = this.getRoomKey(currentRoomId);
        await this.redis.expire(roomKey, 300); // 5 minute TTL
      }
      await this.redis.expire(key, PresenceService.PRESENCE_TTL);
    } else {
      // Create new presence entry
      await this.setPresence(workspaceId, userId, PresenceStatus.ONLINE, { currentRoomId });
    }
  }

  /**
   * Set user as offline
   */
  async setOffline(workspaceId: string, userId: string): Promise<void> {
    const key = this.getUserKey(workspaceId, userId);
    await this.redis.del(key);

    this.logger.debug(`User ${userId} set offline in workspace ${workspaceId}`);
  }

  /**
   * Join a room (add to room presence set)
   * Note: Ban check should be performed by the caller (e.g., ModerationService.isUserBanned)
   * before calling this method to prevent banned users from appearing in room presence.
   */
  async joinRoom(roomId: string, userId: string): Promise<void> {
    const key = this.getRoomKey(roomId);
    await this.redis.sadd(key, userId);
    // Room presence TTL - 5 minutes (refreshed on activity)
    await this.redis.expire(key, 300);

    this.logger.debug(`User ${userId} joined room presence ${roomId}`);
  }

  /**
   * Leave a room (remove from room presence set)
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const key = this.getRoomKey(roomId);
    await this.redis.srem(key, userId);
  }

  /**
   * Get users currently in a room
   */
  async getRoomPresence(roomId: string): Promise<string[]> {
    const key = this.getRoomKey(roomId);
    return this.redis.smembers(key);
  }

  /**
   * Get online count for a workspace
   */
  async getOnlineCount(workspaceId: string): Promise<number> {
    // Use SCAN to count keys matching the workspace pattern
    let cursor = '0';
    let count = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${workspaceId}:*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== '0');

    return count;
  }

  /**
   * Auto-update away status based on inactivity
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async updateAwayStatus(): Promise<void> {
    // This is a simplified version - in production, you'd want to
    // scan all presence keys and update away status based on lastActiveAt

    this.logger.debug('Running away status check');
  }

  /**
   * Cleanup method for testing or shutdown
   */
  async cleanup(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Get effective presence status based on last activity
   */
  getEffectiveStatus(presence: UserPresence): PresenceStatus {
    // If explicitly set to DND, respect that
    if (presence.status === PresenceStatus.DO_NOT_DISTURB) {
      return PresenceStatus.DO_NOT_DISTURB;
    }

    const now = Date.now();
    const lastActive = presence.lastActiveAt.getTime();
    const timeSinceActive = now - lastActive;

    if (timeSinceActive > PresenceService.OFFLINE_THRESHOLD_MS) {
      return PresenceStatus.OFFLINE;
    }

    if (timeSinceActive > PresenceService.AWAY_THRESHOLD_MS) {
      return PresenceStatus.AWAY;
    }

    return PresenceStatus.ONLINE;
  }
}
