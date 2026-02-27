import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

export class WorkspaceMemberDto {
  @ApiProperty({ description: 'Member record ID' })
  id!: string;

  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({ description: 'User email' })
  email!: string;

  @ApiProperty({ enum: WorkspaceRole, description: 'Workspace role' })
  role!: WorkspaceRole;

  @ApiProperty({ description: 'Date when user joined workspace' })
  joinedAt!: Date;

  @ApiProperty({ description: 'Custom role ID', required: false, nullable: true })
  customRoleId?: string | null;

  @ApiProperty({ description: 'Custom role name', required: false, nullable: true })
  customRoleName?: string | null;

  @ApiProperty({ description: 'Display role name', required: false })
  roleName?: string;
}
