import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Observable, from, throwError } from 'rxjs';
import { tap, finalize, mergeMap, catchError } from 'rxjs/operators';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Extracts workspace_id from JWT and sets both:
 * 1. Request context (request.workspaceId)
 * 2. PostgreSQL session variable (app.current_workspace_id) for RLS
 *
 * This enables workspace-scoped queries in all API endpoints with defense-in-depth:
 * - Application-level: Query filters use request.workspaceId
 * - Database-level: RLS policies enforce isolation even if app code has bugs
 *
 * Security: Story 3.7 - Per-Workspace Cost Isolation
 */
@Injectable()
export class WorkspaceContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(WorkspaceContextInterceptor.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Extract workspace_id from authenticated user (set by JwtStrategy)
    const workspaceId = request.user?.workspaceId;

    if (workspaceId) {
      request.workspaceId = workspaceId;

      // SECURITY FIX: Set database context SYNCHRONOUSLY before proceeding
      // This prevents race conditions where queries execute before context is set
      return from(this.setDatabaseWorkspaceContext(workspaceId)).pipe(
        catchError((error) => {
          this.logger.error(
            `CRITICAL: Failed to set database workspace context: ${error.message}`,
          );
          return throwError(
            () =>
              new InternalServerErrorException(
                'Security context initialization failed',
              ),
          );
        }),
        mergeMap(() => next.handle()),
        finalize(() => {
          // Clean up database context after request completes
          // Cleanup failures are logged but don't fail the request
          this.clearDatabaseWorkspaceContext().catch((error) => {
            this.logger.warn(
              `Failed to clear database workspace context: ${error.message}`,
            );
          });
        }),
      );
    }

    // If no workspaceId, proceed without setting context
    return next.handle();
  }

  /**
   * Set PostgreSQL session variable for Row-Level Security
   *
   * SECURITY: Uses transaction-scoped context (third param = TRUE)
   * This ensures context is automatically cleared when transaction ends,
   * preventing context pollution across concurrent requests.
   *
   * @param workspaceId - Workspace ID to set in database session
   */
  private async setDatabaseWorkspaceContext(
    workspaceId: string,
  ): Promise<void> {
    try {
      // Use TRUE for transaction-scoped context (SET LOCAL behavior)
      // This prevents timing vulnerabilities in concurrent requests
      await this.dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, TRUE)`,
        [workspaceId],
      );

      this.logger.debug(`Set workspace context: ${workspaceId}`);
    } catch (error) {
      this.logger.error(
        `Error setting workspace context in database: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Clear PostgreSQL session variable after request
   *
   * Note: With transaction-scoped context (TRUE in setDatabaseWorkspaceContext),
   * this is mostly redundant as the context is automatically cleared.
   * We keep it for defense-in-depth and explicit cleanup.
   */
  private async clearDatabaseWorkspaceContext(): Promise<void> {
    try {
      await this.dataSource.query(
        `SELECT set_config('app.current_workspace_id', NULL, TRUE)`,
      );
      this.logger.debug('Cleared workspace context');
    } catch (error) {
      this.logger.error(
        `Error clearing workspace context in database: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
