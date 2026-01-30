import { IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';

export class CreateInvitationDto {
  @ApiProperty({
    description: 'Email address to invite',
    example: 'colleague@example.com',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @ApiProperty({
    description: 'Role to assign to the invited user',
    enum: WorkspaceRole,
    example: WorkspaceRole.DEVELOPER,
  })
  @IsEnum(WorkspaceRole, {
    message:
      'Invalid role. Must be owner, admin, developer, or viewer',
  })
  role!: WorkspaceRole;
}
