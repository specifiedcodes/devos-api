/**
 * Streaming Interfaces
 * Story 9.8: Agent Response Time Optimization
 *
 * Type definitions for response streaming via WebSocket.
 */

import { Socket } from 'socket.io';

/**
 * Streaming configuration
 */
export interface StreamingConfig {
  /** Transport method */
  transport: 'websocket';
  /** How to chunk responses */
  chunkSize: 'word' | 'sentence' | 'paragraph';
  /** Buffer size before rendering */
  bufferSize: number;
  /** Delay between chunk renders (ms) */
  renderDelay: number;
  /** Reconnect on error */
  reconnectOnError: boolean;
}

/**
 * Streaming event names
 */
export const STREAMING_EVENTS = {
  START: 'agent:response:start',
  CHUNK: 'agent:response:chunk',
  END: 'agent:response:end',
  ERROR: 'agent:response:error',
} as const;

/**
 * Stream start event payload
 */
export interface StreamStartEvent {
  messageId: string;
  agentId: string;
  timestamp: Date;
}

/**
 * Stream chunk event payload
 */
export interface StreamChunkEvent {
  messageId: string;
  chunk: string;
  index: number;
  isLast: boolean;
}

/**
 * Stream end event payload
 */
export interface StreamEndEvent {
  messageId: string;
  totalChunks: number;
  totalTime: number;
  fullResponse: string;
}

/**
 * Stream error event payload
 */
export interface StreamErrorEvent {
  messageId: string;
  error: string;
  code: string;
  partialResponse?: string;
}

/**
 * Agent context for streaming
 */
export interface AgentStreamContext {
  workspaceId: string;
  agentId: string;
  projectId?: string;
  userId: string;
  conversationContext: any[];
  /** Agent type for message categorization */
  agentType?: import('../../../database/entities/agent.entity').AgentType;
}

/**
 * Streaming response service interface
 */
export interface IAgentStreamingService {
  /**
   * Stream response to client via WebSocket
   */
  streamResponse(
    prompt: string,
    context: AgentStreamContext,
    socket: Socket,
  ): Promise<StreamEndEvent>;

  /**
   * Handle individual chunk emission
   */
  handleStreamChunk(
    chunk: string,
    messageId: string,
    index: number,
    socket: Socket,
  ): void;

  /**
   * Finalize stream and save complete message
   */
  finalizeStream(
    messageId: string,
    fullResponse: string,
    context: AgentStreamContext,
  ): Promise<void>;
}

/**
 * Default streaming configuration
 */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  transport: 'websocket',
  chunkSize: 'word',
  bufferSize: 5,
  renderDelay: 50,
  reconnectOnError: true,
};

/**
 * Streaming timeout thresholds (ms)
 */
export const STREAMING_TIMEOUTS = {
  /** Max time to receive first chunk */
  FIRST_CHUNK: 3000,
  /** Max time between chunks */
  BETWEEN_CHUNKS: 5000,
  /** Max total stream time */
  TOTAL_STREAM: 120000,
};
