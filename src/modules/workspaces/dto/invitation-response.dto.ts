import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { InvitationStatus } from '../../../database/entities/workspace-invitation.entity';

export class InvitationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  workspaceName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: WorkspaceRole })
  role!: WorkspaceRole;

  @ApiProperty()
  inviterName!: string;

  @ApiProperty({ enum: InvitationStatus })
  status!: InvitationStatus;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  createdAt!: Date;
}
