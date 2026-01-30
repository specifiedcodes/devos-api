import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';

@Injectable()
export class WorkspaceOwnerGuard implements CanActivate {
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

    const member = await this.workspaceMemberRepository.findOne({
      where: { workspaceId, userId, role: WorkspaceRole.OWNER },
    });

    if (!member) {
      throw new ForbiddenException('Only workspace owners can perform this action');
    }

    return true;
  }
}
