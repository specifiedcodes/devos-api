import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

export class WorkspaceResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiProperty({ example: 'My Workspace' })
  name!: string;

  @ApiProperty({ required: false, example: 'Workspace for client projects' })
  description?: string;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.OWNER })
  role!: WorkspaceRole;

  @ApiProperty({ example: 5, description: 'Number of projects in workspace' })
  projectCount!: number;

  @ApiProperty({ example: 3, description: 'Number of members in workspace' })
  memberCount!: number;

  @ApiProperty({ example: '2026-01-30T10:00:00Z' })
  createdAt!: Date;

  @ApiProperty({ required: false, example: true })
  isCurrentWorkspace?: boolean;
}
