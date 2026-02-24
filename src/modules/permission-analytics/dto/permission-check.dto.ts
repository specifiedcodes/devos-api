import {
  IsUUID,
  IsArray,
  IsString,
  IsNotEmpty,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PermissionCheckItem {
  @ApiProperty({ description: 'Resource type to check', example: 'projects' })
  @IsString()
  @IsNotEmpty()
  resource!: string;

  @ApiProperty({ description: 'Permission to check', example: 'create' })
  @IsString()
  @IsNotEmpty()
  permission!: string;
}

export class PermissionCheckRequestDto {
  @ApiProperty({ description: 'User ID to check permissions for' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'Workspace ID context' })
  @IsUUID()
  workspaceId!: string;

  @ApiProperty({
    description: 'Array of permission checks (max 50)',
    type: [PermissionCheckItem],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PermissionCheckItem)
  checks!: PermissionCheckItem[];
}

export class PermissionCheckResultItem {
  resource!: string;
  permission!: string;
  granted!: boolean;
}

export class PermissionCheckResponseDto {
  results!: PermissionCheckResultItem[];
  userRole!: string;
  checkedAt!: string;
  cacheHit!: boolean;
}
