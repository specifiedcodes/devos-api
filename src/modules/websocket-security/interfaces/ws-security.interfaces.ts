/**
 * WebSocket Security Interfaces
 * Story 15.7: WebSocket Security Hardening (AC10)
 *
 * TypeScript interfaces for all WebSocket security events and payloads.
 */

/**
 * Authenticated user data stored on socket.data after JWT verification.
 */
export interface WsAuthPayload {
  userId: string;
  workspaceId: string;
  role: string;
}

/**
 * Payload for room join requests.
 */
export interface WsRoomJoinPayload {
  room: string;
}

/**
 * Rate limit warning event payload.
 */
export interface WsRateLimitWarning {
  type: 'message' | 'join' | 'broadcast';
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Reconnection replay event payload.
 */
export interface WsReconnectionReplayEvent {
  room: string;
  count: number;
  events?: unknown[];
}

/**
 * Token refresh request payload from client.
 */
export interface WsTokenRefreshPayload {
  refreshToken: string;
}

/**
 * Token refreshed response payload to client.
 */
export interface WsTokenRefreshedEvent {
  accessToken: string;
  expiresIn: number;
}

/**
 * WebSocket error event payload.
 */
export interface WsErrorEvent {
  code: string;
  message: string;
}

/**
 * Monitoring alert event payload.
 */
export interface WsMonitoringAlert {
  type: string;
  details: Record<string, unknown>;
  timestamp: number;
}

/**
 * Buffered event stored in Redis sorted set.
 */
export interface WsBufferedEvent {
  event: string;
  data: unknown;
  room: string;
  timestamp: number;
}

/**
 * Socket with typed data after authentication.
 */
export interface WsAuthenticatedSocket {
  id: string;
  data: WsAuthPayload & Record<string, unknown>;
  handshake: {
    auth: { token?: string };
    address: string;
    query: Record<string, string>;
  };
  emit: (event: string, ...args: unknown[]) => boolean;
  join: (room: string) => void;
  disconnect: (close?: boolean) => void;
  rooms: Set<string>;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}
