import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsDateString,
  MaxLength,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ApiTokenScope {
  PERMISSIONS_CHECK = 'permissions:check',
  MEMBERS_READ = 'members:read',
  ROLES_READ = 'roles:read',
  PERMISSIONS_READ = 'permissions:read',
}

const VALID_SCOPES = Object.values(ApiTokenScope);

export class CreateApiTokenDto {
  @ApiProperty({ description: 'Token name', example: 'Slack Integration Token' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Token scopes',
    example: ['permissions:check', 'members:read'],
    enum: ApiTokenScope,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(VALID_SCOPES, { each: true })
  scopes!: string[];

  @ApiPropertyOptional({ description: 'Token expiry date (ISO 8601)', example: '2027-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
