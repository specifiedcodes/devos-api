import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';

/**
 * Custom throttler guard for login endpoint that tracks by email + IP combination
 * This prevents bypassing rate limits by using different emails from the same IP
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Get IP address from request
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    // Get email from request body (if present)
    const email = req.body?.email?.toLowerCase() || 'no-email';

    // Track by combination of email and IP
    return `${email}-${ip}`;
  }
}
