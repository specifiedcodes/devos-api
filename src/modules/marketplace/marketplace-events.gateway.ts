/**
 * MarketplaceEventsGateway
 *
 * Story 18-8: Agent Installation Flow
 *
 * WebSocket gateway for real-time installation progress updates.
 */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { InstallationStatus } from '../../database/entities/installation-log.entity';

export interface InstallationProgressEvent {
  installationId: string;
  marketplaceAgentId: string;
  agentName: string;
  status: InstallationStatus;
  currentStep: string;
  progressPercentage: number;
  message?: string;
  error?: string;
  timestamp: Date;
}

@WebSocketGateway({
  namespace: '/marketplace',
  cors: { origin: '*' },
})
export class MarketplaceEventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MarketplaceEventsGateway.name);

  handleConnection(client: Socket): void {
    const user = (client.handshake as any).user;
    if (!user) {
      this.logger.warn('Unauthenticated WebSocket connection attempt');
      client.disconnect(true);
      return;
    }

    // User joins their workspace room for installation updates
    const workspaceId = client.handshake.query.workspaceId as string;
    if (workspaceId) {
      client.join(`workspace:${workspaceId}`);
      this.logger.debug(
        `Client ${client.id} joined workspace:${workspaceId} room`,
      );
    }

    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
    // Cleanup handled automatically by socket.io
  }

  @SubscribeMessage('subscribe:installation')
  async handleSubscribeInstallation(
    client: Socket,
    data: { installationId: string },
  ): Promise<{ success: boolean }> {
    if (!data.installationId) {
      throw new WsException('installationId is required');
    }

    client.join(`installation:${data.installationId}`);
    this.logger.debug(
      `Client ${client.id} subscribed to installation:${data.installationId}`,
    );

    return { success: true };
  }

  @SubscribeMessage('unsubscribe:installation')
  async handleUnsubscribeInstallation(
    client: Socket,
    data: { installationId: string },
  ): Promise<{ success: boolean }> {
    if (!data.installationId) {
      throw new WsException('installationId is required');
    }

    client.leave(`installation:${data.installationId}`);
    this.logger.debug(
      `Client ${client.id} unsubscribed from installation:${data.installationId}`,
    );

    return { success: true };
  }

  /**
   * Emit installation progress to subscribed clients.
   * Called by MarketplaceService during installation.
   */
  emitProgress(event: InstallationProgressEvent, workspaceId: string): void {
    this.logger.debug(
      `Emitting progress for installation ${event.installationId}: ${event.progressPercentage}%`,
    );

    this.server
      .to(`installation:${event.installationId}`)
      .to(`workspace:${workspaceId}`)
      .emit('installation:progress', event);
  }

  /**
   * Emit installation completion.
   */
  emitComplete(event: InstallationProgressEvent, workspaceId: string): void {
    this.logger.debug(
      `Emitting completion for installation ${event.installationId}`,
    );

    this.server
      .to(`installation:${event.installationId}`)
      .to(`workspace:${workspaceId}`)
      .emit('installation:complete', event);
  }

  /**
   * Emit installation failure.
   */
  emitError(event: InstallationProgressEvent, workspaceId: string): void {
    this.logger.debug(
      `Emitting error for installation ${event.installationId}: ${event.error}`,
    );

    this.server
      .to(`installation:${event.installationId}`)
      .to(`workspace:${workspaceId}`)
      .emit('installation:error', event);
  }

  /**
   * Emit installation cancellation.
   */
  emitCancelled(event: InstallationProgressEvent, workspaceId: string): void {
    this.logger.debug(
      `Emitting cancellation for installation ${event.installationId}`,
    );

    this.server
      .to(`installation:${event.installationId}`)
      .to(`workspace:${workspaceId}`)
      .emit('installation:cancelled', event);
  }

  /**
   * Emit rollback started.
   */
  emitRollback(event: InstallationProgressEvent, workspaceId: string): void {
    this.logger.debug(
      `Emitting rollback for installation ${event.installationId}`,
    );

    this.server
      .to(`installation:${event.installationId}`)
      .to(`workspace:${workspaceId}`)
      .emit('installation:rollback', event);
  }
}
