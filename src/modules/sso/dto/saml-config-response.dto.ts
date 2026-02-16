import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SamlConfigResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() providerName!: string;
  @ApiPropertyOptional() displayName!: string | null;
  @ApiProperty() entityId!: string;
  @ApiProperty() ssoUrl!: string;
  @ApiPropertyOptional() sloUrl!: string | null;
  @ApiProperty({ description: 'Certificate fingerprint (SHA-256), NOT the raw certificate' })
  certificateFingerprint!: string | null;
  @ApiPropertyOptional() certificateExpiresAt!: Date | null;
  @ApiProperty() attributeMapping!: Record<string, string>;
  @ApiProperty() nameIdFormat!: string;
  @ApiProperty() wantAssertionsSigned!: boolean;
  @ApiProperty() wantResponseSigned!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isTested!: boolean;
  @ApiPropertyOptional() lastLoginAt!: Date | null;
  @ApiProperty() loginCount!: number;
  @ApiProperty() errorCount!: number;
  @ApiPropertyOptional() lastError!: string | null;
  @ApiPropertyOptional() metadataUrl!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
