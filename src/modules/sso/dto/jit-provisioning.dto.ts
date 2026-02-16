import { IsBoolean, IsOptional, IsString, IsEnum, IsObject, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating/updating JIT provisioning configuration
 */
export class UpdateJitProvisioningConfigDto {
  @ApiPropertyOptional({ description: 'Enable/disable JIT provisioning', default: true })
  @IsOptional()
  @IsBoolean()
  jitEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Default role for new users', enum: ['admin', 'developer', 'viewer'], default: 'developer' })
  @IsOptional()
  @IsString()
  @IsEnum(['admin', 'developer', 'viewer'], { message: 'defaultRole must be one of: admin, developer, viewer' })
  defaultRole?: string;

  @ApiPropertyOptional({ description: 'Auto-update user profile on subsequent logins', default: true })
  @IsOptional()
  @IsBoolean()
  autoUpdateProfile?: boolean;

  @ApiPropertyOptional({ description: 'Auto-update workspace role from IdP groups on subsequent logins', default: false })
  @IsOptional()
  @IsBoolean()
  autoUpdateRoles?: boolean;

  @ApiPropertyOptional({ description: 'Send welcome email to newly provisioned users', default: true })
  @IsOptional()
  @IsBoolean()
  welcomeEmail?: boolean;

  @ApiPropertyOptional({ description: 'Restrict provisioning to specific email domains', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requireEmailDomains?: string[] | null;

  @ApiPropertyOptional({
    description: 'Map IdP attributes to DevOS profile fields. Keys are DevOS fields, values are IdP attribute names.',
    example: { email: 'email', firstName: 'given_name', lastName: 'family_name', groups: 'memberOf' },
  })
  @IsOptional()
  @IsObject()
  attributeMapping?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Map IdP groups to DevOS workspace roles. Keys are IdP group names, values are DevOS roles.',
    example: { 'Engineering Leads': 'admin', 'Engineering': 'developer', 'Contractors': 'viewer' },
  })
  @IsOptional()
  @IsObject()
  groupRoleMapping?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'How to handle existing users: link_existing (add to workspace), reject (deny login), prompt_admin (queue for approval)',
    enum: ['link_existing', 'reject', 'prompt_admin'],
    default: 'link_existing',
  })
  @IsOptional()
  @IsString()
  @IsEnum(['link_existing', 'reject', 'prompt_admin'], { message: 'conflictResolution must be one of: link_existing, reject, prompt_admin' })
  conflictResolution?: string;
}

/**
 * Response DTO for JIT provisioning configuration
 */
export class JitProvisioningConfigResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  jitEnabled!: boolean;

  @ApiProperty()
  defaultRole!: string;

  @ApiProperty()
  autoUpdateProfile!: boolean;

  @ApiProperty()
  autoUpdateRoles!: boolean;

  @ApiProperty()
  welcomeEmail!: boolean;

  @ApiPropertyOptional({ type: [String] })
  requireEmailDomains!: string[] | null;

  @ApiProperty()
  attributeMapping!: Record<string, string>;

  @ApiProperty()
  groupRoleMapping!: Record<string, string>;

  @ApiProperty()
  conflictResolution!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

/**
 * Internal interface for provisioning result (not exposed via API)
 */
export interface JitProvisioningResult {
  user: { id: string; email: string };
  isNewUser: boolean;
  profileUpdated: boolean;
  roleUpdated: boolean;
  previousRole?: string;
  newRole?: string;
  conflictResolved?: 'linked' | 'rejected' | 'pending_approval';
  provisioningDetails: Record<string, unknown>;
}

/**
 * Internal interface for extracted IdP attributes
 */
export interface ExtractedIdpAttributes {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  groups?: string[];
  department?: string;
  jobTitle?: string;
  rawAttributes: Record<string, unknown>;
}
