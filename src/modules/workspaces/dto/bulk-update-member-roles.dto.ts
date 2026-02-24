/**
 * Bulk Update Member Roles DTO
 * Story 20-7: Role Management UI
 *
 * DTO for changing multiple workspace members' roles in a single operation.
 * Exactly one of `role` or `customRoleId` must be provided.
 * Supports 1-50 member IDs per request.
 */

import {
  IsArray,
  IsUUID,
  IsOptional,
  IsEnum,
  ValidateIf,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SystemRole } from './update-member-role.dto';

export class BulkUpdateMemberRolesDto {
  @ApiProperty({ description: 'Array of member IDs to update', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  memberIds!: string[];

  @ApiPropertyOptional({ description: 'System role name', enum: SystemRole })
  @IsOptional()
  @IsEnum(SystemRole)
  @ValidateIf((o) => !o.customRoleId)
  role?: SystemRole;

  @ApiPropertyOptional({ description: 'Custom role UUID' })
  @IsOptional()
  @IsUUID()
  @ValidateIf((o) => !o.role)
  customRoleId?: string;
}
