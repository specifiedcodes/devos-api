import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';

@Injectable()
export class WorkspaceAdminGuard implements CanActivate {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const workspaceId = request.params.id;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!workspaceId) {
      throw new ForbiddenException('Workspace ID not provided');
    }

    // Owner OR Admin can access
    const member = await this.workspaceMemberRepository.findOne({
      where: [
        { workspaceId, userId, role: WorkspaceRole.OWNER },
        { workspaceId, userId, role: WorkspaceRole.ADMIN },
      ],
    });

    if (!member) {
      throw new ForbiddenException('Only workspace owners or admins can perform this action');
    }

    return true;
  }
}
