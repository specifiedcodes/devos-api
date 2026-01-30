import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RenameWorkspaceDto {
  @ApiProperty({
    example: 'Renamed Workspace',
    description: 'New workspace name',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @Length(3, 50, { message: 'Workspace name must be between 3 and 50 characters' })
  name!: string;
}
