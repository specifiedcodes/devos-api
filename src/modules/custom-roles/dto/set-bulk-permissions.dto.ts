import { IsArray, ValidateNested, IsOptional, IsString, IsEnum, IsNotEmpty, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SetPermissionDto } from './set-permission.dto';
import { ResourceType } from '../../../database/entities/role-permission.entity';

export class SetBulkPermissionsDto {
  @ApiProperty({ description: 'Array of permissions to set', type: [SetPermissionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetPermissionDto)
  permissions!: SetPermissionDto[];
}

export class ResourceBulkActionDto {
  @ApiProperty({ description: 'Resource type', enum: ResourceType })
  @IsNotEmpty()
  @IsEnum(ResourceType)
  resourceType!: ResourceType;

  @ApiProperty({ description: 'Action to perform: allow_all or deny_all', enum: ['allow_all', 'deny_all'] })
  @IsNotEmpty()
  @IsString()
  @IsIn(['allow_all', 'deny_all'], { message: 'action must be either allow_all or deny_all' })
  action!: 'allow_all' | 'deny_all';
}

export class ResetPermissionsDto {
  @ApiPropertyOptional({ description: 'Resource type to reset (omit to reset all)', enum: ResourceType })
  @IsOptional()
  @IsString()
  @IsEnum(ResourceType)
  resourceType?: string;
}
