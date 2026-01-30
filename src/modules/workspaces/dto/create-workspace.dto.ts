import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, IsOptional, MaxLength } from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({
    example: 'My New Workspace',
    description: 'Workspace name',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @Length(3, 50, { message: 'Workspace name must be between 3 and 50 characters' })
  name!: string;

  @ApiProperty({
    required: false,
    example: 'Workspace for client projects',
    description: 'Optional workspace description',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must be less than 500 characters' })
  description?: string;
}
