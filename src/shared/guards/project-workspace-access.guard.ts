import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../../database/entities/project.entity';

/**
 * Guard to validate that authenticated user has access to project's workspace
 *
 * This guard:
 * 1. Extracts projectId from URL params
 * 2. Loads project from database to get workspace_id
 * 3. Validates user is member of that workspace
 *
 * Apply to routes with :projectId parameter that need workspace isolation
 * Story 4.7 Issue #1 Fix: Workspace access guard for provisioning endpoints
 */
@Injectable()
export class ProjectWorkspaceAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const projectId = request.params.projectId;

    // Check if user is authenticated
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Check if projectId parameter exists
    if (!projectId) {
      // If no project param, allow (guard not applicable)
      return true;
    }

    // Load project to get workspace_id
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      select: ['id', 'workspaceId'],
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    // Validate user has access to project's workspace
    // Option 1: User belongs to a single workspace
    if (user.workspaceId && user.workspaceId !== project.workspaceId) {
      throw new ForbiddenException(
        'Access denied: You do not have permission to access this project',
      );
    }

    // Option 2: User belongs to multiple workspaces (check array)
    if (
      user.workspaces &&
      Array.isArray(user.workspaces) &&
      !user.workspaces.includes(project.workspaceId)
    ) {
      throw new ForbiddenException(
        'Access denied: You do not have permission to access this project',
      );
    }

    // Store workspace_id in request for downstream use
    request.workspaceId = project.workspaceId;

    return true;
  }
}
