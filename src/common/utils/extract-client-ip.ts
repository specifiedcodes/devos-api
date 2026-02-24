/**
 * Shared utility to extract the real client IP from a request.
 *
 * Uses request.ip as the primary source (respects Express 'trust proxy' setting),
 * then falls back to connection remoteAddress.
 *
 * IMPORTANT: Ensure 'trust proxy' is configured in the NestJS/Express app
 * (e.g., app.set('trust proxy', 'loopback')) so that request.ip resolves
 * correctly behind a reverse proxy/load balancer.
 *
 * We intentionally do NOT blindly trust X-Forwarded-For to prevent
 * header spoofing attacks that could bypass IP allowlisting.
 */
export function extractClientIp(request: any): string {
  // request.ip respects Express trust proxy config
  if (request.ip) {
    return request.ip;
  }
  return request.connection?.remoteAddress || '0.0.0.0';
}
