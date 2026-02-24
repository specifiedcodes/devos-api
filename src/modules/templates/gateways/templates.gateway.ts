/**
 * TemplatesGateway
 *
 * Story 19-3: Parameterized Scaffolding
 * Story 19-6: Template Installation Flow
 *
 * WebSocket gateway for real-time scaffolding and installation progress updates.
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
import { ConfigService } from '@nestjs/config';
import { ScaffoldJobStatus } from '../services/template-scaffolding.service';
import { InstallationStatus, InstallationStep } from '../../database/entities/template-installation.entity';

/**
 * Progress event payload
 */
export interface ScaffoldProgressEvent {
  jobId: string;
  status: ScaffoldJobStatus;
  progress: number;
  currentStep: string;
  totalFiles: number;
  processedFiles: number;
  timestamp: string;
}

/**
 * Completion event payload
 */
export interface ScaffoldCompleteEvent {
  jobId: string;
  projectId: string;
  projectUrl: string;
  timestamp: string;
}

/**
 * Error event payload
 */
export interface ScaffoldErrorEvent {
  jobId: string;
  error: string;
  timestamp: string;
}

// ============================================
// Story 19-6: Installation Event Types
// ============================================

/**
 * Installation started event payload
 */
export interface InstallationStartedEvent {
  installationId: string;
  templateId: string;
  userId: string;
  timestamp: string;
}

/**
 * Installation progress event payload
 */
export interface InstallationProgressEvent {
  installationId: string;
  status: InstallationStatus;
  step: InstallationStep;
  progress: number;
  timestamp: string;
}

/**
 * Installation complete event payload
 */
export interface InstallationCompleteEvent {
  installationId: string;
  projectId: string;
  projectUrl: string;
  timestamp: string;
}

/**
 * Installation failed event payload
 */
export interface InstallationFailedEvent {
  installationId: string;
  error: string;
  timestamp: string;
}

/**
 * Get CORS configuration from environment
 */
function getCorsOrigin(): string | string[] {
  const allowedOrigins = process.env.WS_ALLOWED_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:3000';

  // Support comma-separated list of origins
  if (allowedOrigins.includes(',')) {
    return allowedOrigins.split(',').map(o => o.trim());
  }

  return allowedOrigins;
}

@WebSocketGateway({
  namespace: '/templates',
  cors: {
    origin: getCorsOrigin(),
    credentials: true,
  },
})
export class TemplatesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TemplatesGateway.name);

  handleConnection(client: Socket): void {
    const user = (client.handshake as any).user;
    if (!user) {
      this.logger.warn('Unauthenticated WebSocket connection attempt');
      client.disconnect(true);
      return;
    }

    // User joins their workspace room
    const workspaceId = client.handshake.query.workspaceId as string;
    if (workspaceId) {
      client.join(`workspace:${workspaceId}`);
      this.logger.debug(`Client ${client.id} joined workspace:${workspaceId} room`);
    }

    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:scaffold')
  async handleJoinScaffold(
    client: Socket,
    data: { jobId: string },
  ): Promise<{ success: boolean }> {
    if (!data.jobId) {
      throw new WsException('jobId is required');
    }

    client.join(`scaffold:${data.jobId}`);
    this.logger.debug(`Client ${client.id} joined scaffold:${data.jobId}`);

    return { success: true };
  }

  @SubscribeMessage('leave:scaffold')
  async handleLeaveScaffold(
    client: Socket,
    data: { jobId: string },
  ): Promise<{ success: boolean }> {
    if (!data.jobId) {
      throw new WsException('jobId is required');
    }

    client.leave(`scaffold:${data.jobId}`);
    this.logger.debug(`Client ${client.id} left scaffold:${data.jobId}`);

    return { success: true };
  }

  /**
   * Emit progress event to clients watching a job.
   */
  emitProgress(jobId: string, event: ScaffoldProgressEvent): void {
    this.logger.debug(`Emitting progress for job ${jobId}: ${event.progress}%`);

    this.server.to(`scaffold:${jobId}`).emit('scaffold:progress', event);
  }

  /**
   * Emit completion event.
   */
  emitComplete(jobId: string, event: ScaffoldCompleteEvent): void {
    this.logger.debug(`Emitting completion for job ${jobId}`);

    this.server.to(`scaffold:${jobId}`).emit('scaffold:complete', event);
  }

  /**
   * Emit error event.
   */
  emitError(jobId: string, event: ScaffoldErrorEvent): void {
    this.logger.debug(`Emitting error for job ${jobId}: ${event.error}`);

    this.server.to(`scaffold:${jobId}`).emit('scaffold:error', event);
  }

  // ============================================
  // Story 19-6: Installation Event Methods
  // ============================================

  @SubscribeMessage('join:installation')
  async handleJoinInstallation(
    client: Socket,
    data: { installationId: string },
  ): Promise<{ success: boolean }> {
    if (!data.installationId) {
      throw new WsException('installationId is required');
    }

    client.join(`installation:${data.installationId}`);
    this.logger.debug(`Client ${client.id} joined installation:${data.installationId}`);

    return { success: true };
  }

  @SubscribeMessage('leave:installation')
  async handleLeaveInstallation(
    client: Socket,
    data: { installationId: string },
  ): Promise<{ success: boolean }> {
    if (!data.installationId) {
      throw new WsException('installationId is required');
    }

    client.leave(`installation:${data.installationId}`);
    this.logger.debug(`Client ${client.id} left installation:${data.installationId}`);

    return { success: true };
  }

  /**
   * Emit installation started event.
   */
  emitInstallationStarted(installationId: string, event: InstallationStartedEvent): void {
    this.logger.debug(`Emitting installation started for ${installationId}`);
    this.server.to(`installation:${installationId}`).emit('installation:started', event);
  }

  /**
   * Emit installation progress event.
   */
  emitInstallationProgress(installationId: string, event: InstallationProgressEvent): void {
    this.logger.debug(`Emitting installation progress for ${installationId}: ${event.progress}%`);
    this.server.to(`installation:${installationId}`).emit('installation:progress', event);
  }

  /**
   * Emit installation complete event.
   */
  emitInstallationComplete(installationId: string, event: InstallationCompleteEvent): void {
    this.logger.debug(`Emitting installation complete for ${installationId}`);
    this.server.to(`installation:${installationId}`).emit('installation:complete', event);
  }

  /**
   * Emit installation failed event.
   */
  emitInstallationFailed(installationId: string, event: InstallationFailedEvent): void {
    this.logger.debug(`Emitting installation failed for ${installationId}: ${event.error}`);
    this.server.to(`installation:${installationId}`).emit('installation:failed', event);
  }
}
