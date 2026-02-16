import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  IsEmail,
  ArrayMaxSize,
  IsString,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EnableEnforcementDto {
  @ApiPropertyOptional({ description: 'Grace period in hours before enforcement takes effect (0 to 720)', example: 72, default: 72 })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(720)
  @Type(() => Number)
  gracePeriodHours?: number;

  @ApiPropertyOptional({ description: 'Email addresses that bypass SSO enforcement (max 50)', example: ['admin@acme.com'] })
  @IsArray()
  @IsOptional()
  @IsEmail({}, { each: true })
  @ArrayMaxSize(50)
  bypassEmails?: string[];

  @ApiPropertyOptional({ description: 'Whether workspace owner retains password fallback', default: true })
  @IsBoolean()
  @IsOptional()
  ownerBypassEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Whether service accounts are exempt from SSO requirement', default: true })
  @IsBoolean()
  @IsOptional()
  bypassServiceAccounts?: boolean;

  @ApiPropertyOptional({ description: 'Custom enforcement message shown on login page (max 500 chars)', example: 'Please sign in using your corporate SSO.' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  enforcementMessage?: string;
}

export class UpdateEnforcementDto {
  @ApiPropertyOptional({ description: 'Email addresses that bypass SSO enforcement (max 50)' })
  @IsArray()
  @IsOptional()
  @IsEmail({}, { each: true })
  @ArrayMaxSize(50)
  bypassEmails?: string[];

  @ApiPropertyOptional({ description: 'Whether workspace owner retains password fallback' })
  @IsBoolean()
  @IsOptional()
  ownerBypassEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Whether service accounts are exempt from SSO requirement' })
  @IsBoolean()
  @IsOptional()
  bypassServiceAccounts?: boolean;

  @ApiPropertyOptional({ description: 'Custom enforcement message shown on login page (max 500 chars)' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  enforcementMessage?: string;
}

export class EnforcementStatusResponseDto {
  @ApiProperty() workspaceId!: string;
  @ApiProperty() enforced!: boolean;
  @ApiProperty() passwordLoginBlocked!: boolean;
  @ApiProperty() registrationBlocked!: boolean;
  @ApiProperty() inGracePeriod!: boolean;
  @ApiPropertyOptional() gracePeriodEnd!: string | null;
  @ApiPropertyOptional() gracePeriodRemainingHours!: number | null;
  @ApiProperty() enforcementMessage!: string;
  @ApiProperty() activeProviderCount!: number;
  @ApiProperty({ type: [String] }) bypassEmails!: string[];
  @ApiProperty() ownerBypassEnabled!: boolean;
  @ApiProperty() bypassServiceAccounts!: boolean;
}

export class EnforcementCheckResponseDto {
  @ApiProperty() allowed!: boolean;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional() enforcementMessage?: string;
  @ApiPropertyOptional() redirectToSso?: boolean;
  @ApiPropertyOptional() ssoProviderHint?: string;
}

export class LoginEnforcementCheckDto {
  @ApiProperty({ description: 'Email address to check enforcement for' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: 'Workspace ID to check enforcement for (if known)' })
  @IsUUID()
  @IsOptional()
  workspaceId?: string;
}

export class AddBypassEmailDto {
  @ApiProperty({ description: 'Email address to add to the bypass list' })
  @IsEmail()
  email!: string;
}
