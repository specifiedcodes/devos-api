// DEPRECATED: Scheduled for removal. See Epic 28.
// TODO(epic-28-cleanup): Remove after sunset period
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * @deprecated This interceptor adds deprecation headers to Vercel/Supabase endpoints.
 * Scheduled for removal after the sunset period (90 days from 2026-03-01).
 *
 * Adds the following HTTP headers to all responses:
 * - `Deprecation: true` (RFC 8594)
 * - `Sunset: <date>` (RFC 8594) - 90 days from now
 * - `Link: <migration-url>; rel="deprecation"` - migration documentation
 *
 * Also logs a deprecation warning for each call.
 */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DeprecationInterceptor.name);
  private readonly provider: string;
  private readonly sunsetDate: string;

  constructor(provider: 'vercel' | 'supabase') {
    this.provider = provider;
    // Sunset date: 90 days from 2026-03-01
    const sunset = new Date('2026-03-01');
    sunset.setDate(sunset.getDate() + 90);
    this.sunsetDate = sunset.toUTCString();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method;
    const url = request.url;

    // Add deprecation headers
    response.setHeader('Deprecation', 'true');
    response.setHeader('Sunset', this.sunsetDate);
    response.setHeader(
      'Link',
      `</api/v1/migration/deployment-status>; rel="deprecation"; title="Migration Guide"`,
    );

    return next.handle().pipe(
      tap(() => {
        this.logger.warn(
          `DEPRECATED: ${this.provider} endpoint called: ${method} ${url}. ` +
            `${this.provider === 'vercel' ? 'Vercel' : 'Supabase'} integration is deprecated. ` +
            `Use Railway instead. Sunset date: ${this.sunsetDate}`,
        );
      }),
    );
  }
}

/**
 * Factory function to create a Vercel deprecation interceptor.
 * @deprecated Use Railway deployment instead.
 */
export function createVercelDeprecationInterceptor(): DeprecationInterceptor {
  return new DeprecationInterceptor('vercel');
}

/**
 * Factory function to create a Supabase deprecation interceptor.
 * @deprecated Use Railway deployment instead.
 */
export function createSupabaseDeprecationInterceptor(): DeprecationInterceptor {
  return new DeprecationInterceptor('supabase');
}
