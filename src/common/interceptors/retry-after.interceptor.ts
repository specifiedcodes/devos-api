import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Response } from 'express';

/**
 * Interceptor that adds Retry-After header to 429 (Too Many Requests) responses
 * This improves UX by telling clients when they can retry after rate limiting
 */
@Injectable()
export class RetryAfterInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        // Check if it's a 429 Too Many Requests error
        if (
          error instanceof HttpException &&
          error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
        ) {
          const response = context.switchToHttp().getResponse<Response>();

          // Add Retry-After header (15 minutes = 900 seconds)
          // This matches our rate limit TTL of 900,000ms
          response.setHeader('Retry-After', '900');

          // Also add custom header with expiry timestamp for better client experience
          const retryAfterTimestamp = new Date(
            Date.now() + 900000,
          ).toISOString();
          response.setHeader('X-RateLimit-Reset', retryAfterTimestamp);
        }

        return throwError(() => error);
      }),
    );
  }
}
