import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
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

      // Set PostgreSQL session variable for RLS policies
      // This is done asynchronously and doesn't block the request
      this.setDatabaseWorkspaceContext(workspaceId).catch((error) => {
        this.logger.warn(
          `Failed to set database workspace context: ${error.message}`,
        );
      });
    }

    return next.handle().pipe(
      finalize(() => {
        // Clean up database context after request completes
        if (workspaceId) {
          this.clearDatabaseWorkspaceContext().catch((error) => {
            this.logger.warn(
              `Failed to clear database workspace context: ${error.message}`,
            );
          });
        }
      }),
    );
  }

  /**
   * Set PostgreSQL session variable for Row-Level Security
   *
   * @param workspaceId - Workspace ID to set in database session
   */
  private async setDatabaseWorkspaceContext(
    workspaceId: string,
  ): Promise<void> {
    try {
      await this.dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, FALSE)`,
        [workspaceId],
      );
    } catch (error) {
      this.logger.error(
        `Error setting workspace context in database: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Clear PostgreSQL session variable after request
   */
  private async clearDatabaseWorkspaceContext(): Promise<void> {
    try {
      await this.dataSource.query(
        `SELECT set_config('app.current_workspace_id', NULL, FALSE)`,
      );
    } catch (error) {
      this.logger.error(
        `Error clearing workspace context in database: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
