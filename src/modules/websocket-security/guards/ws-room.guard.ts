import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { RedisService } from '../../redis/redis.service';
import { WS_REDIS_KEYS, WS_REDIS_TTLS, WS_EVENTS } from '../ws-security.constants';

/**
 * WebSocket Room Authorization Guard
 * Story 15.7: WebSocket Security Hardening (AC2)
 *
 * Validates room name format, checks workspace membership via
 * database with Redis caching, and enforces workspace isolation.
 */
@Injectable()
export class WsRoomGuard {
  private readonly logger = new Logger(WsRoomGuard.name);

  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Handles a room join request.
   * Validates room format, checks workspace membership, and joins the room.
   *
   * @param socket - The authenticated socket
   * @param room - Room name to join (format: workspace:{workspaceId}:{feature}:{subId})
   */
  async handleJoin(
    socket: { data: Record<string, unknown>; emit: Function; join: Function },
    room: string,
  ): Promise<boolean> {
    // Validate room name format
    if (!this.isValidRoomFormat(room)) {
      socket.emit(WS_EVENTS.ERROR, {
        code: 'INVALID_ROOM',
        message: 'Invalid room format',
      });
      return false;
    }

    // Extract workspaceId from room name
    const roomWorkspaceId = this.extractWorkspaceId(room);

    // Cross-workspace join prevention: socket's JWT workspace must match room workspace
    const socketWorkspaceId = socket.data.workspaceId as string;
    if (socketWorkspaceId && socketWorkspaceId !== roomWorkspaceId) {
      socket.emit(WS_EVENTS.ERROR, {
        code: 'FORBIDDEN',
        message: 'No access to workspace',
      });
      return false;
    }

    // Verify workspace membership
    const userId = socket.data.userId as string;
    const hasMembership = await this.checkMembership(userId, roomWorkspaceId);

    if (!hasMembership) {
      socket.emit(WS_EVENTS.ERROR, {
        code: 'FORBIDDEN',
        message: 'No access to workspace',
      });
      return false;
    }

    // Join the room and confirm
    socket.join(room);
    socket.emit(WS_EVENTS.ROOM_JOINED, { room });

    this.logger.debug(
      `User ${userId} joined room ${room}`,
    );

    return true;
  }

  /**
   * Validates room name format.
   * Must start with "workspace:" and have at least 3 segments after split.
   * Format: workspace:{workspaceId}:{feature}:{subId}
   */
  isValidRoomFormat(room: string): boolean {
    if (!room || !room.startsWith('workspace:')) {
      return false;
    }

    const segments = room.split(':');
    // Must have at least 3 segments: "workspace", workspaceId, feature
    return segments.length >= 3 && segments[1].length > 0 && segments[2].length > 0;
  }

  /**
   * Extracts workspaceId from a valid room name.
   */
  extractWorkspaceId(room: string): string {
    return room.split(':')[1];
  }

  /**
   * Checks workspace membership with Redis cache.
   * Cache key: ws:membership:{userId}:{workspaceId}, TTL: 300s
   */
  async checkMembership(
    userId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const cacheKey = `${WS_REDIS_KEYS.MEMBERSHIP_CACHE}:${userId}:${workspaceId}`;

    // Check cache first
    const cached = await this.redisService.get(cacheKey);
    if (cached === 'true') {
      return true;
    }

    // Query database
    const member = await this.workspaceMemberRepository.findOne({
      where: { userId, workspaceId },
    });

    if (member) {
      // Cache the result
      await this.redisService.set(
        cacheKey,
        'true',
        WS_REDIS_TTLS.MEMBERSHIP_CACHE,
      );
      return true;
    }

    return false;
  }
}
