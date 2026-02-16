import { IsNotEmpty, IsString, MinLength, MaxLength, Matches, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DOMAIN_CONSTANTS } from '../constants/domain.constants';

/**
 * DTO for registering a new domain for SSO verification
 */
export class RegisterDomainDto {
  @ApiProperty({
    description: 'Domain name to register for SSO verification (e.g., acme.com)',
    example: 'acme.com',
    minLength: 3,
    maxLength: 253,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  @Matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/, {
    message: 'Invalid domain format. Must be a valid domain name (e.g., acme.com)',
  })
  domain!: string;
}

/**
 * DTO for linking a domain to an SSO provider
 */
export class LinkDomainProviderDto {
  @ApiPropertyOptional({
    description: 'SAML configuration ID to link',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  samlConfigId?: string;

  @ApiPropertyOptional({
    description: 'OIDC configuration ID to link',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  oidcConfigId?: string;
}

/**
 * Response DTO for domain operations
 */
export class DomainResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() domain!: string;
  @ApiProperty() verificationMethod!: string;
  @ApiProperty() verificationToken!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) verifiedAt!: string | null;
  @ApiProperty({ nullable: true }) expiresAt!: string | null;
  @ApiProperty({ nullable: true }) lastCheckAt!: string | null;
  @ApiProperty({ nullable: true }) lastCheckError!: string | null;
  @ApiProperty() checkCount!: number;
  @ApiProperty({ nullable: true }) samlConfigId!: string | null;
  @ApiProperty({ nullable: true }) oidcConfigId!: string | null;
  @ApiProperty({ nullable: true }) createdBy!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  // Computed field for DNS instruction
  @ApiProperty({ description: 'DNS TXT record instruction for domain verification' })
  dnsInstruction!: string;
}

/**
 * Response DTO for domain lookup (email-based SSO routing)
 */
export class DomainLookupResponseDto {
  @ApiProperty() found!: boolean;
  @ApiPropertyOptional() domain?: string;
  @ApiPropertyOptional({ enum: ['saml', 'oidc'] }) providerType?: 'saml' | 'oidc';
  @ApiPropertyOptional() providerId?: string;
  @ApiPropertyOptional() providerName?: string;
  @ApiPropertyOptional() workspaceId?: string;
}
