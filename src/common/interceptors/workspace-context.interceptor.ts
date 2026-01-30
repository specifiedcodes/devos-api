import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Extracts workspace_id from JWT and attaches to request context
 * This enables workspace-scoped queries in all API endpoints
 */
@Injectable()
export class WorkspaceContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Extract workspace_id from authenticated user (set by JwtStrategy)
    if (request.user?.workspaceId) {
      request.workspaceId = request.user.workspaceId;
    }

    return next.handle();
  }
}
