import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter
 * For production, use Redis-based rate limiting
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly limits = new Map<string, RateLimitEntry>();

  /**
   * Check if request is allowed under rate limit
   * @param key - Unique identifier for the resource (e.g., 'byok:workspace-id:key-id')
   * @param maxRequests - Maximum requests allowed in the window
   * @param windowMs - Time window in milliseconds
   * @throws HttpException (429 Too Many Requests) if rate limit exceeded
   */
  async checkLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<void> {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now > entry.resetAt) {
      // Create new entry
      this.limits.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      throw new HttpException(
        `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment count
    entry.count++;
  }

  /**
   * Reset rate limit for a key
   */
  async reset(key: string): Promise<void> {
    this.limits.delete(key);
  }

  /**
   * Cleanup expired entries (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetAt) {
        this.limits.delete(key);
      }
    }
  }
}
