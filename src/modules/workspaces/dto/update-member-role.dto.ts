/**
 * Update Member Role DTO
 * Story 20-7: Role Management UI
 *
 * DTO for changing a single workspace member's role.
 * Supports both system roles and custom role assignment.
 * Exactly one of `role` or `customRoleId` must be provided.
 */

import {
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum SystemRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  VIEWER = 'viewer',
}

export class UpdateMemberRoleDto {
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
