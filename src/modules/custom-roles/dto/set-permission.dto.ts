import { IsNotEmpty, IsString, IsBoolean, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceType } from '../../../database/entities/role-permission.entity';

export class SetPermissionDto {
  @ApiProperty({ description: 'Resource type', enum: ResourceType, example: 'projects' })
  @IsNotEmpty()
  @IsString()
  @IsEnum(ResourceType)
  resourceType!: string;

  @ApiProperty({ description: 'Permission name', example: 'create' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  permission!: string;

  @ApiProperty({ description: 'Whether the permission is granted', example: true })
  @IsBoolean()
  granted!: boolean;
}
