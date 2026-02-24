import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PermissionEntryDto {
  @ApiProperty() permission!: string;
  @ApiProperty() granted!: boolean;
  @ApiProperty() inherited!: boolean;
  @ApiPropertyOptional() inheritedFrom?: string;
}

export class ResourcePermissionsDto {
  @ApiProperty() resourceType!: string;
  @ApiProperty({ type: [PermissionEntryDto] }) permissions!: PermissionEntryDto[];
}

export class PermissionMatrixResponseDto {
  @ApiProperty() roleId!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional() baseRole!: string | null;
  @ApiProperty({ type: [ResourcePermissionsDto] }) resources!: ResourcePermissionsDto[];
}

export class EffectivePermissionsResponseDto {
  @ApiProperty() userId!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() systemRole!: string;
  @ApiPropertyOptional() customRoleId!: string | null;
  @ApiPropertyOptional() customRoleName!: string | null;
  @ApiProperty({ type: [ResourcePermissionsDto] }) resources!: ResourcePermissionsDto[];
}
