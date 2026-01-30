import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

export class ChangeMemberRoleDto {
  @ApiProperty({
    enum: WorkspaceRole,
    description: 'New role for the workspace member',
  })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
