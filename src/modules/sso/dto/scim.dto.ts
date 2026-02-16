import { IsBoolean, IsOptional, IsString, IsArray, IsNumber, Min, Max, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================
// SCIM Configuration DTOs
// ============================

export class UpdateScimConfigDto {
  @ApiPropertyOptional({ description: 'Enable/disable SCIM provisioning' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Default role for SCIM-provisioned users', enum: ['admin', 'developer', 'viewer'] })
  @IsOptional()
  @IsString()
  @IsIn(['admin', 'developer', 'viewer'], { message: 'defaultRole must be one of: admin, developer, viewer' })
  defaultRole?: string;

  @ApiPropertyOptional({ description: 'Whether to process SCIM group operations', default: true })
  @IsOptional()
  @IsBoolean()
  syncGroups?: boolean;

  @ApiPropertyOptional({ description: 'Auto-deactivate user on SCIM DELETE', default: true })
  @IsOptional()
  @IsBoolean()
  autoDeactivate?: boolean;

  @ApiPropertyOptional({ description: 'Auto-reactivate user on SCIM create/update if previously deactivated', default: true })
  @IsOptional()
  @IsBoolean()
  autoReactivate?: boolean;
}

export class ScimConfigResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() baseUrl!: string;
  @ApiProperty() defaultRole!: string;
  @ApiProperty() syncGroups!: boolean;
  @ApiProperty() autoDeactivate!: boolean;
  @ApiProperty() autoReactivate!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

// ============================
// SCIM Token DTOs
// ============================

export class CreateScimTokenDto {
  @ApiPropertyOptional({ description: 'Label for the token', default: 'Default SCIM Token' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: 'Token expiration date (ISO 8601). Null for no expiration.' })
  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}

export class ScimTokenResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() tokenPrefix!: string;
  @ApiProperty() label!: string;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() lastUsedAt!: string | null;
  @ApiPropertyOptional() expiresAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class ScimTokenCreatedResponseDto extends ScimTokenResponseDto {
  @ApiProperty({ description: 'The full token value. Only returned once on creation.' })
  token!: string;
}

// ============================
// SCIM 2.0 Resource DTOs (RFC 7643)
// ============================

export class ScimMeta {
  @ApiProperty() resourceType!: string;
  @ApiProperty() created!: string;
  @ApiProperty() lastModified!: string;
  @ApiProperty() location!: string;
}

export class ScimName {
  @ApiPropertyOptional() formatted?: string;
  @ApiPropertyOptional() familyName?: string;
  @ApiPropertyOptional() givenName?: string;
}

export class ScimEmail {
  @ApiProperty() value!: string;
  @ApiPropertyOptional() type?: string;
  @ApiProperty() primary!: boolean;
}

export class ScimUserResource {
  @ApiProperty() schemas!: string[];
  @ApiProperty() id!: string;
  @ApiPropertyOptional() externalId?: string;
  @ApiProperty() userName!: string;
  @ApiPropertyOptional() name?: ScimName;
  @ApiPropertyOptional() displayName?: string;
  @ApiProperty() active!: boolean;
  @ApiProperty() emails!: ScimEmail[];
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() department?: string;
  @ApiProperty() meta!: ScimMeta;
  @ApiPropertyOptional() groups?: Array<{ value: string; display: string; $ref: string }>;
}

export class ScimGroupMember {
  @ApiProperty() value!: string;
  @ApiPropertyOptional() display?: string;
  @ApiPropertyOptional() $ref?: string;
}

export class ScimGroupResource {
  @ApiProperty() schemas!: string[];
  @ApiProperty() id!: string;
  @ApiPropertyOptional() externalId?: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() members!: ScimGroupMember[];
  @ApiProperty() meta!: ScimMeta;
}

export class ScimListResponse<T = ScimUserResource | ScimGroupResource> {
  @ApiProperty() schemas!: string[];
  @ApiProperty() totalResults!: number;
  @ApiProperty() startIndex!: number;
  @ApiProperty() itemsPerPage!: number;
  @ApiProperty() Resources!: T[];
}

export class ScimErrorResponse {
  @ApiProperty() schemas!: string[];
  @ApiProperty() status!: string;
  @ApiPropertyOptional() scimType?: string;
  @ApiProperty() detail!: string;
}

// ============================
// SCIM PATCH Operation DTO
// ============================

export class ScimPatchOperationValue {
  @ApiProperty() op!: 'add' | 'remove' | 'replace';
  @ApiPropertyOptional() path?: string;
  @ApiPropertyOptional() value?: unknown;
}

export class ScimPatchRequest {
  @ApiProperty() schemas!: string[];
  @ApiProperty({ type: [ScimPatchOperationValue] }) Operations!: ScimPatchOperationValue[];
}

// ============================
// SCIM Create User Request DTO
// ============================

export class ScimCreateUserRequest {
  @ApiProperty() schemas!: string[];
  @ApiProperty() userName!: string;
  @ApiPropertyOptional() externalId?: string;
  @ApiPropertyOptional() name?: ScimName;
  @ApiPropertyOptional() displayName?: string;
  @ApiProperty() active!: boolean;
  @ApiPropertyOptional() emails?: ScimEmail[];
  @ApiPropertyOptional() title?: string;
  @ApiPropertyOptional() department?: string;
}

// ============================
// SCIM Sync Log DTOs
// ============================

export class ScimSyncLogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() operation!: string;
  @ApiProperty() resourceType!: string;
  @ApiPropertyOptional() resourceId!: string | null;
  @ApiPropertyOptional() externalId!: string | null;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() errorMessage!: string | null;
  @ApiProperty() createdAt!: string;
}

export class ScimSyncLogListResponseDto {
  @ApiProperty({ type: [ScimSyncLogResponseDto] }) logs!: ScimSyncLogResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
