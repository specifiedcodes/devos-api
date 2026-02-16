import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OidcConfigResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() providerType!: string;
  @ApiPropertyOptional() displayName!: string | null;
  @ApiProperty() clientId!: string;
  // clientSecret is NEVER exposed in responses
  @ApiProperty() discoveryUrl!: string;
  @ApiPropertyOptional() issuer!: string | null;
  @ApiPropertyOptional() authorizationEndpoint!: string | null;
  @ApiPropertyOptional() tokenEndpoint!: string | null;
  @ApiPropertyOptional() userinfoEndpoint!: string | null;
  @ApiPropertyOptional() endSessionEndpoint!: string | null;
  @ApiProperty() scopes!: string[];
  @ApiPropertyOptional() allowedDomains!: string[] | null;
  @ApiProperty() usePkce!: boolean;
  @ApiProperty() tokenEndpointAuthMethod!: string;
  @ApiProperty() attributeMapping!: Record<string, string>;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isTested!: boolean;
  @ApiPropertyOptional() lastLoginAt!: Date | null;
  @ApiProperty() loginCount!: number;
  @ApiProperty() errorCount!: number;
  @ApiPropertyOptional() lastError!: string | null;
  @ApiPropertyOptional() lastErrorAt!: Date | null;
  @ApiPropertyOptional() discoveryLastFetchedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
