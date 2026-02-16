import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUrl,
  IsOptional,
  IsBoolean,
  IsObject,
  IsArray,
  IsIn,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { OidcProviderType } from '../../../database/entities/oidc-configuration.entity';

export class CreateOidcConfigDto {
  @ApiProperty({ description: 'OIDC provider type', example: 'google', enum: OidcProviderType })
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'microsoft', 'okta', 'auth0', 'custom'])
  providerType!: OidcProviderType;

  @ApiPropertyOptional({ description: 'Admin-friendly display name', example: 'Acme Google Workspace' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  displayName?: string;

  @ApiProperty({ description: 'OAuth2 Client ID from provider', example: '123456789.apps.googleusercontent.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  clientId!: string;

  @ApiProperty({ description: 'OAuth2 Client Secret from provider' })
  @IsString()
  @IsNotEmpty()
  clientSecret!: string;

  @ApiProperty({
    description: 'OIDC Discovery URL (.well-known/openid-configuration)',
    example: 'https://accounts.google.com/.well-known/openid-configuration',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  discoveryUrl!: string;

  @ApiPropertyOptional({
    description: 'OAuth2 scopes to request',
    example: ['openid', 'email', 'profile'],
    default: ['openid', 'email', 'profile'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(20)
  scopes?: string[];

  @ApiPropertyOptional({
    description: 'Restrict to specific email domains',
    example: ['acme.com', 'acme.io'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(50)
  allowedDomains?: string[];

  @ApiPropertyOptional({ description: 'Use PKCE (recommended)', default: true })
  @IsBoolean()
  @IsOptional()
  usePkce?: boolean;

  @ApiPropertyOptional({
    description: 'Token endpoint authentication method',
    default: 'client_secret_post',
  })
  @IsString()
  @IsOptional()
  @IsIn(['client_secret_post', 'client_secret_basic'])
  tokenEndpointAuthMethod?: string;

  @ApiPropertyOptional({
    description: 'Attribute mapping from OIDC claims to DevOS fields',
    example: { email: 'email', firstName: 'given_name', lastName: 'family_name', groups: 'groups' },
  })
  @IsObject()
  @IsOptional()
  attributeMapping?: Record<string, string>;
}
