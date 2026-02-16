import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { loggingContext, RequestContext } from '../logging.context';

/**
 * CorrelationIdMiddleware
 * Story 14.3: Loki Log Aggregation (AC5)
 *
 * NestJS middleware that generates or propagates a correlation/trace ID
 * for every incoming HTTP request. The trace ID is stored in AsyncLocalStorage
 * so it can be retrieved anywhere in the request lifecycle.
 *
 * Header precedence:
 * 1. x-trace-id (highest)
 * 2. x-correlation-id
 * 3. Auto-generated UUID v4 (fallback)
 *
 * Always attaches the trace ID as the x-trace-id response header.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const traceId =
      (req.headers['x-trace-id'] as string) ||
      (req.headers['x-correlation-id'] as string) ||
      uuidv4();

    // Attach trace ID to response headers
    res.setHeader('x-trace-id', traceId);

    // Extract workspace from headers (available at middleware time).
    // Note: userId is NOT extracted here because req.user is populated by
    // JWT auth guards which run AFTER middleware in the NestJS lifecycle.
    // The RequestLoggingInterceptor reads userId directly from the request
    // object after guards have executed.
    const workspaceId =
      (req as any).workspaceId ||
      (req.headers['x-workspace-id'] as string);

    const context: RequestContext = {
      traceId,
      workspaceId,
    };

    // Run the rest of the request inside the async local storage context
    loggingContext.run(context, () => {
      next();
    });
  }
}
