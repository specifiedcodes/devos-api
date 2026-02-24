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
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

/**
 * Enriched member response with role display info.
 * Used as the return type for updateMemberRoleWithCustom and GET /members.
 * Replaces the previous `Promise<any>` return type for type safety.
 */
export interface EnrichedMemberResponse {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  roleName: string;
  customRoleId: string | null;
  customRoleName: string | null;
  lastActiveAt: string | null;
  joinedAt: string | Date;
  avatarUrl: string | null;
}
