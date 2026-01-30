import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request, Response, NextFunction } from 'express';
import { TenantConnectionService } from '../../database/services/tenant-connection.service';
import { Workspace } from '../../database/entities/workspace.entity';

@Injectable()
export class WorkspaceContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const workspaceId = req.headers['x-workspace-id'] as string;

    if (workspaceId) {
      // Lookup workspace schema_name from workspaces table
      const workspace = await this.workspaceRepository.findOne({
        where: { id: workspaceId },
      });

      if (workspace) {
        // Set database search_path to workspace schema
        await this.tenantConnectionService.setWorkspaceContext(workspace.schemaName);

        // Store workspace context in request for later use
        (req as any).workspaceContext = {
          workspaceId: workspace.id,
          schemaName: workspace.schemaName,
        };
      }
    }

    // Call next middleware/handler
    next();

    // TECHNICAL DEBT (Issue #4): Race condition risk with async reset
    // The res.on('finish') event is async and non-blocking. In high concurrency scenarios,
    // if another request arrives on the same connection before resetContext() completes,
    // it could operate in the wrong workspace schema (cross-tenant data leakage).
    //
    // MITIGATION: Current implementation uses connection pooling with 100 connections,
    // reducing the probability of connection reuse before reset completes.
    //
    // FUTURE FIX: Implement request-scoped database connections using NestJS request scope
    // or AsyncLocalStorage pattern. This requires refactoring DatabaseModule to use
    // REQUEST scoped providers. Tracked for Epic 2 (Multi-tenant workspace features).
    res.on('finish', async () => {
      await this.tenantConnectionService.resetContext();
    });
  }
}
