import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { createWsAuthMiddleware } from './middleware/ws-auth.middleware';
import { WsRoomGuard } from './guards/ws-room.guard';
import { WsRateLimiterGuard } from './guards/ws-rate-limiter.guard';
import { WsTokenRefreshHandler } from './handlers/ws-token-refresh.handler';
import { WsReconnectionService } from './services/ws-reconnection.service';
import { WsMonitoringService } from './services/ws-monitoring.service';
import { RedisService } from '../redis/redis.service';
import { WS_TIMEOUTS, WS_EVENTS } from './ws-security.constants';

/**
 * WebSocket Security Gateway
 * Story 15.7: WebSocket Security Hardening (AC7)
 *
 * NestJS WebSocket gateway that integrates all security services:
 * JWT auth middleware, room guard, rate limiter, token refresh,
 * reconnection service, and monitoring.
 */
@WebSocketGateway({
  namespace: '/ws',
  pingTimeout: WS_TIMEOUTS.PING_TIMEOUT,
  pingInterval: WS_TIMEOUTS.PING_INTERVAL,
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class WsSecurityGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WsSecurityGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly wsRoomGuard: WsRoomGuard,
    private readonly wsRateLimiterGuard: WsRateLimiterGuard,
    private readonly wsTokenRefreshHandler: WsTokenRefreshHandler,
    private readonly wsReconnectionService: WsReconnectionService,
    private readonly wsMonitoringService: WsMonitoringService,
  ) {}

  /**
   * Applies JWT auth middleware after server initialization.
   */
  afterInit(server: Server): void {
    const middleware = createWsAuthMiddleware(
      this.jwtService,
      this.redisService,
    );
    server.use(middleware as any);
    this.logger.log('WebSocket security gateway initialized with auth middleware');
  }

  /**
   * Handles new connections - sets up monitoring and reconnection.
   */
  async handleConnection(client: Socket): Promise<void> {
    const workspaceId = client.data?.workspaceId as string;
    const ip = client.handshake.address;

    this.logger.debug(
      `Client connected: ${client.id}, workspace: ${workspaceId}`,
    );

    // Track connection
    if (workspaceId) {
      await this.wsMonitoringService.onConnect(workspaceId, ip);
    }

    // Handle reconnection
    const lastEventTimestamp = client.handshake.query?.lastEventTimestamp;
    if (lastEventTimestamp) {
      const rooms = await this.wsReconnectionService.getTrackedRooms(client.id);
      await this.wsReconnectionService.handleReconnection(
        client as any,
        parseInt(lastEventTimestamp as string, 10),
        rooms,
      );
    }
  }

  /**
   * Handles disconnections - cleans up state.
   */
  async handleDisconnect(client: Socket): Promise<void> {
    const workspaceId = client.data?.workspaceId as string;

    this.logger.debug(`Client disconnected: ${client.id}`);

    // Clean up monitoring
    if (workspaceId) {
      await this.wsMonitoringService.onDisconnect(workspaceId);
    }

    // Clean up rate limiting state
    await this.wsRateLimiterGuard.cleanup(client.id);

    // Clean up reconnection tracking
    await this.wsReconnectionService.cleanup(client.id);

    // Clean up token refresh timers
    this.wsTokenRefreshHandler.cleanup(client.id);
  }

  /**
   * Handles room join requests.
   */
  @SubscribeMessage(WS_EVENTS.JOIN)
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string },
  ): Promise<void> {
    // Check rate limit for joins
    const joinAllowed = await this.wsRateLimiterGuard.checkJoinRate(client as any);
    if (!joinAllowed) {
      this.wsMonitoringService.recordRateLimitEvent('warning');
      return;
    }

    const success = await this.wsRoomGuard.handleJoin(client as any, data.room);

    if (success) {
      // Track room subscription for reconnection
      await this.wsReconnectionService.trackRoomSubscription(client.id, data.room);

      // Audit join
      const workspaceId = this.wsRoomGuard.extractWorkspaceId(data.room);
      await this.wsMonitoringService.auditRoomJoin(
        workspaceId,
        client.data.userId as string,
        data.room,
      );
      this.wsMonitoringService.recordRoomJoin('success');
    } else {
      this.wsMonitoringService.recordRoomJoin('forbidden');
    }
  }

  /**
   * Handles room leave requests.
   */
  @SubscribeMessage(WS_EVENTS.LEAVE)
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room: string },
  ): Promise<void> {
    client.leave(data.room);

    // Remove room subscription tracking
    await this.wsReconnectionService.removeRoomSubscription(client.id, data.room);

    // Audit leave
    if (this.wsRoomGuard.isValidRoomFormat(data.room)) {
      const workspaceId = this.wsRoomGuard.extractWorkspaceId(data.room);
      await this.wsMonitoringService.auditRoomLeave(
        workspaceId,
        client.data.userId as string,
        data.room,
      );
    }

    this.logger.debug(`Client ${client.id} left room ${data.room}`);
  }

  /**
   * Handles token refresh requests.
   */
  @SubscribeMessage(WS_EVENTS.AUTH_REFRESH)
  async handleAuthRefresh(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { refreshToken: string },
  ): Promise<void> {
    await this.wsTokenRefreshHandler.handleRefresh(client as any, data);
  }
}
