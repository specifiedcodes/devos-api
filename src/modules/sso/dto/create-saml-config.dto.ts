import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  IsOptional,
  IsBoolean,
  IsObject,
  MaxLength,
  IsIn,
} from 'class-validator';

export class CreateSamlConfigDto {
  @ApiProperty({ description: 'IdP provider preset name', example: 'Okta' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsIn(['Okta', 'Azure AD', 'OneLogin', 'Google Workspace', 'Custom'])
  providerName!: string;

  @ApiPropertyOptional({ description: 'Admin-friendly display name', example: 'Acme Corp Okta' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  displayName?: string;

  @ApiProperty({ description: 'IdP Entity ID / Issuer', example: 'https://www.okta.com/exk123abc' })
  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @ApiProperty({ description: 'IdP SSO URL', example: 'https://acme.okta.com/app/devos/sso/saml' })
  @IsString()
  @IsNotEmpty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  ssoUrl!: string;

  @ApiPropertyOptional({ description: 'IdP SLO URL', example: 'https://acme.okta.com/app/devos/slo/saml' })
  @IsString()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  sloUrl?: string;

  @ApiProperty({
    description: 'IdP X.509 signing certificate (PEM format)',
    example: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
  })
  @IsString()
  @IsNotEmpty()
  certificate!: string;

  @ApiPropertyOptional({
    description: 'Attribute mapping from IdP assertion to DevOS fields',
    example: {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      groups: 'http://schemas.xmlsoap.org/claims/Group',
    },
  })
  @IsObject()
  @IsOptional()
  attributeMapping?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'SAML NameID format',
    example: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  })
  @IsString()
  @IsOptional()
  nameIdFormat?: string;

  @ApiPropertyOptional({ description: 'Require signed assertions from IdP', default: true })
  @IsBoolean()
  @IsOptional()
  wantAssertionsSigned?: boolean;

  @ApiPropertyOptional({ description: 'Require signed SAML response from IdP', default: true })
  @IsBoolean()
  @IsOptional()
  wantResponseSigned?: boolean;

  @ApiPropertyOptional({
    description: 'IdP metadata URL for auto-configuration',
    example: 'https://acme.okta.com/app/exk123/sso/saml/metadata',
  })
  @IsString()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  metadataUrl?: string;
}
