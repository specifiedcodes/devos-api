/**
 * AgentStreamingService
 * Story 9.8: Agent Response Time Optimization
 *
 * Handles streaming responses from Claude API to clients via WebSocket.
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { ClaudeApiService } from '../../agents/services/claude-api.service';
import { ChatService } from '../chat.service';
import { RedisService } from '../../redis/redis.service';
import { ChatSenderType } from '../../../database/entities/chat-message.entity';
import { AgentType } from '../../../database/entities/agent.entity';
import {
  STREAMING_EVENTS,
  AgentStreamContext,
  StreamStartEvent,
  StreamChunkEvent,
  StreamEndEvent,
  StreamErrorEvent,
  IAgentStreamingService,
  STREAMING_TIMEOUTS,
} from '../interfaces/streaming.interfaces';

/**
 * Stream metrics for performance monitoring
 */
export interface StreamMetrics {
  totalChunks: number;
  totalTime: number;
  avgChunkTime: number;
  firstChunkTime: number;
}

@Injectable()
export class AgentStreamingService implements IAgentStreamingService {
  private readonly logger = new Logger(AgentStreamingService.name);

  constructor(
    @Inject(forwardRef(() => ClaudeApiService))
    private readonly claudeApiService: ClaudeApiService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Stream response to client via WebSocket
   * Includes proper cleanup on socket disconnect
   */
  async streamResponse(
    prompt: string,
    context: AgentStreamContext,
    socket: Socket,
  ): Promise<StreamEndEvent> {
    const messageId = this.generateMessageId();
    const startTime = Date.now();
    const chunks: string[] = [];
    let firstChunkTime: number | null = null;
    let isAborted = false;

    // Track abort controller for cleanup
    const abortController = new AbortController();

    // Setup disconnect handler to abort stream if client disconnects
    const disconnectHandler = () => {
      this.logger.warn(`Socket ${socket.id} disconnected, aborting stream ${messageId}`);
      isAborted = true;
      abortController.abort();
    };
    socket.once('disconnect', disconnectHandler);

    try {
      // Emit start event
      const startEvent: StreamStartEvent = {
        messageId,
        agentId: context.agentId,
        timestamp: new Date(),
      };
      socket.emit(STREAMING_EVENTS.START, startEvent);

      // Broadcast start via Redis for multi-instance support
      await this.broadcastStreamEvent(context.workspaceId, STREAMING_EVENTS.START, startEvent);

      // Stream from Claude API
      const stream = await this.claudeApiService.streamMessage({
        workspaceId: context.workspaceId,
        systemPrompt: this.buildSystemPrompt(context),
        userPrompt: prompt,
      });

      let chunkIndex = 0;
      for await (const event of stream) {
        // Check if stream was aborted due to disconnect
        if (isAborted || abortController.signal.aborted) {
          this.logger.warn(`Stream ${messageId} aborted, stopping chunk processing`);
          break;
        }

        // Extract text from streaming event
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const chunk = event.delta.text;
          if (!chunk) continue; // Skip empty chunks

          chunks.push(chunk);

          // Record first chunk time
          if (firstChunkTime === null) {
            firstChunkTime = Date.now() - startTime;
          }

          // Determine if this is the last chunk
          const isLast = false; // We don't know until stream ends

          // Emit chunk event (only if socket still connected)
          if (socket.connected) {
            this.handleStreamChunk(chunk, messageId, chunkIndex, socket);
          }

          // Broadcast chunk via Redis
          await this.broadcastStreamEvent(context.workspaceId, STREAMING_EVENTS.CHUNK, {
            messageId,
            chunk,
            index: chunkIndex,
            isLast,
          });

          chunkIndex++;
        }
      }

      // Mark last chunk
      if (chunks.length > 0) {
        const lastChunkEvent: StreamChunkEvent = {
          messageId,
          chunk: chunks[chunks.length - 1],
          index: chunks.length - 1,
          isLast: true,
        };
        // We already emitted it, just update via broadcast
        await this.broadcastStreamEvent(context.workspaceId, STREAMING_EVENTS.CHUNK, lastChunkEvent);
      }

      // Build full response
      const fullResponse = chunks.join('');
      const totalTime = Date.now() - startTime;

      // Finalize stream and save message
      await this.finalizeStream(messageId, fullResponse, context);

      // Emit end event
      const endEvent: StreamEndEvent = {
        messageId,
        totalChunks: chunks.length,
        totalTime,
        fullResponse,
      };
      socket.emit(STREAMING_EVENTS.END, endEvent);

      // Broadcast end via Redis
      await this.broadcastStreamEvent(context.workspaceId, STREAMING_EVENTS.END, endEvent);

      this.logger.log(
        `Stream completed: ${messageId}, ${chunks.length} chunks, ${totalTime}ms`,
      );

      return endEvent;
    } catch (error: any) {
      // Don't log abort errors as errors - they're expected on disconnect
      if (isAborted) {
        this.logger.warn(`Stream ${messageId} aborted by client disconnect`);
      } else {
        this.logger.error(`Stream error: ${error.message}`, error.stack);
      }

      // Emit error event (only if socket still connected)
      const errorEvent: StreamErrorEvent = {
        messageId,
        error: isAborted ? 'Stream aborted - client disconnected' : (error.message || 'Stream error'),
        code: isAborted ? 'STREAM_ABORTED' : (error.code || 'STREAM_ERROR'),
        partialResponse: chunks.join(''),
      };

      if (socket.connected) {
        socket.emit(STREAMING_EVENTS.ERROR, errorEvent);
      }

      // Broadcast error via Redis
      await this.broadcastStreamEvent(context.workspaceId, STREAMING_EVENTS.ERROR, errorEvent);

      throw error;
    } finally {
      // Always clean up the disconnect handler
      socket.off('disconnect', disconnectHandler);
    }
  }

  /**
   * Handle individual chunk emission
   */
  handleStreamChunk(
    chunk: string,
    messageId: string,
    index: number,
    socket: Socket,
  ): void {
    // Check socket is still connected
    if (!socket.connected) {
      this.logger.warn(`Socket ${socket.id} disconnected during stream`);
      return;
    }

    const chunkEvent: StreamChunkEvent = {
      messageId,
      chunk,
      index,
      isLast: false, // Updated when stream completes
    };

    socket.emit(STREAMING_EVENTS.CHUNK, chunkEvent);
  }

  /**
   * Finalize stream and save complete message
   */
  async finalizeStream(
    messageId: string,
    fullResponse: string,
    context: AgentStreamContext,
  ): Promise<void> {
    try {
      // Save complete message to database
      // Use agent type from context if provided, default to ORCHESTRATOR
      const { message } = await this.chatService.createMessage({
        workspaceId: context.workspaceId,
        projectId: context.projectId || null,
        agentId: context.agentId,
        userId: null,
        senderType: ChatSenderType.AGENT,
        agentType: context.agentType || AgentType.ORCHESTRATOR,
        text: fullResponse,
      });

      // Broadcast complete message via Redis
      await this.redisService.publish(
        'chat-events',
        JSON.stringify({
          event: 'chat:message',
          workspaceId: context.workspaceId,
          data: {
            id: message.id,
            streamMessageId: messageId,
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            agentId: context.agentId,
            senderType: 'agent',
            text: fullResponse,
            createdAt: message.createdAt,
          },
        }),
      );

      this.logger.log(`Stream finalized: ${messageId} -> ${message.id}`);
    } catch (error: any) {
      this.logger.error(`Failed to finalize stream: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate unique message ID for stream
   */
  generateMessageId(): string {
    return `stream-${uuidv4()}`;
  }

  /**
   * Calculate stream metrics for monitoring
   */
  calculateStreamMetrics(startTime: number, chunks: string[]): StreamMetrics {
    const totalTime = Date.now() - startTime;

    return {
      totalChunks: chunks.length,
      totalTime,
      avgChunkTime: chunks.length > 0 ? totalTime / chunks.length : 0,
      firstChunkTime: 0, // Would need to be tracked separately
    };
  }

  /**
   * Build system prompt for streaming context
   */
  private buildSystemPrompt(context: AgentStreamContext): string {
    // Basic system prompt - can be enhanced based on agent type
    return `You are an AI assistant in DevOS. Respond helpfully and concisely.`;
  }

  /**
   * Broadcast stream event via Redis for multi-instance support
   */
  private async broadcastStreamEvent(
    workspaceId: string,
    event: string,
    data: any,
  ): Promise<void> {
    try {
      await this.redisService.publish(
        'stream-events',
        JSON.stringify({
          event,
          workspaceId,
          data,
        }),
      );
    } catch (error: any) {
      this.logger.warn(`Failed to broadcast stream event: ${error.message}`);
    }
  }
}
