import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { WsRoomGuard } from '../guards/ws-room.guard';
import {
  WS_REDIS_KEYS,
  WS_REDIS_TTLS,
  WS_BUFFER_LIMITS,
  WS_EVENTS,
} from '../ws-security.constants';

/**
 * WebSocket Reconnection Service
 * Story 15.7: WebSocket Security Hardening (AC4)
 *
 * Manages event buffering in Redis sorted sets, event pruning,
 * buffer limits, reconnection event replay, and room subscription tracking.
 */
@Injectable()
export class WsReconnectionService {
  private readonly logger = new Logger(WsReconnectionService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly wsRoomGuard: WsRoomGuard,
  ) {}

  /**
   * Buffers an event in the Redis sorted set for a specific room.
   * Score = timestamp for chronological ordering.
   */
  async bufferEvent(room: string, event: { event: string; data: unknown }): Promise<void> {
    const key = `${WS_REDIS_KEYS.EVENT_BUFFER}:${room}`;
    const timestamp = Date.now();

    const serialized = JSON.stringify({
      ...event,
      room,
      timestamp,
    });

    await this.redisService.zadd(key, timestamp, serialized);

    // Set TTL on the key
    await this.redisService.expire(key, WS_REDIS_TTLS.EVENT_BUFFER);

    // Enforce buffer limit
    await this.enforceBufferLimit(room);

    // Prune old events
    await this.pruneBuffer(room);
  }

  /**
   * Prunes events older than 5 minutes from the buffer.
   */
  async pruneBuffer(room: string): Promise<void> {
    const key = `${WS_REDIS_KEYS.EVENT_BUFFER}:${room}`;
    const cutoff = Date.now() - WS_REDIS_TTLS.EVENT_BUFFER * 1000;
    await this.redisService.zremrangebyscore(key, '-inf', cutoff);
  }

  /**
   * Enforces the maximum events per room limit.
   * Keeps only the latest MAX_EVENTS_PER_ROOM events by removing
   * the oldest entries (lowest scores) using zremrangebyrank.
   */
  async enforceBufferLimit(room: string): Promise<void> {
    const key = `${WS_REDIS_KEYS.EVENT_BUFFER}:${room}`;
    const count = await this.redisService.zcard(key);

    if (count > WS_BUFFER_LIMITS.MAX_EVENTS_PER_ROOM) {
      // Remove oldest events (rank 0 = lowest score = oldest).
      // Keep only the latest MAX_EVENTS_PER_ROOM entries.
      const removeEnd = count - WS_BUFFER_LIMITS.MAX_EVENTS_PER_ROOM - 1;
      await this.redisService.zremrangebyrank(key, 0, removeEnd);
    }
  }

  /**
   * Tracks room subscriptions for a socket in Redis.
   */
  async trackRoomSubscription(socketId: string, room: string): Promise<void> {
    const key = `${WS_REDIS_KEYS.ROOMS}:${socketId}`;
    await this.redisService.zadd(key, Date.now(), room);
    await this.redisService.expire(key, WS_REDIS_TTLS.ROOM_TRACKING);
  }

  /**
   * Removes room subscription tracking for a socket.
   */
  async removeRoomSubscription(socketId: string, room: string): Promise<void> {
    const key = `${WS_REDIS_KEYS.ROOMS}:${socketId}`;
    await this.redisService.zrem(key, room);
  }

  /**
   * Gets tracked rooms for a socket (for reconnection).
   */
  async getTrackedRooms(socketId: string): Promise<string[]> {
    const key = `${WS_REDIS_KEYS.ROOMS}:${socketId}`;
    return this.redisService.zrangebyscore(key, '-inf', '+inf');
  }

  /**
   * Handles reconnection by replaying missed events.
   *
   * @param socket - The reconnecting socket
   * @param lastEventTimestamp - Client's last received event timestamp
   * @param rooms - Rooms to replay events from
   */
  async handleReconnection(
    socket: { id: string; data: Record<string, unknown>; emit: Function; join: Function },
    lastEventTimestamp: number,
    rooms: string[],
  ): Promise<void> {
    if (!lastEventTimestamp) {
      this.logger.debug(`Fresh connection for socket ${socket.id}, no replay needed`);
      return;
    }

    for (const room of rooms) {
      // Re-validate workspace membership
      const roomWorkspaceId = this.wsRoomGuard.extractWorkspaceId(room);
      const userId = socket.data.userId as string;
      const hasMembership = await this.wsRoomGuard.checkMembership(
        userId,
        roomWorkspaceId,
      );

      if (!hasMembership) {
        this.logger.warn(
          `Socket ${socket.id} no longer authorized for room ${room}, skipping replay`,
        );
        continue;
      }

      // Re-join room
      socket.join(room);

      // Get missed events from Redis sorted set
      const key = `${WS_REDIS_KEYS.EVENT_BUFFER}:${room}`;
      const rawEvents = await this.redisService.zrangebyscore(
        key,
        lastEventTimestamp + 1,
        '+inf',
      );

      if (rawEvents.length === 0) {
        continue;
      }

      // Parse events
      const events = rawEvents.map((raw) => JSON.parse(raw));

      // Emit replay start
      socket.emit(WS_EVENTS.RECONNECTION_REPLAY_START, {
        room,
        count: events.length,
      });

      // Replay events in chronological order
      for (const event of events) {
        socket.emit(event.event, event.data);
      }

      // Emit replay end
      socket.emit(WS_EVENTS.RECONNECTION_REPLAY_END, {
        room,
        count: events.length,
      });

      this.logger.debug(
        `Replayed ${events.length} events for room ${room} to socket ${socket.id}`,
      );
    }
  }

  /**
   * Cleans up all tracking data for a disconnecting socket.
   */
  async cleanup(socketId: string): Promise<void> {
    const key = `${WS_REDIS_KEYS.ROOMS}:${socketId}`;
    await this.redisService.del(key);
  }
}
