import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ExpirationOption {
  SEVEN_DAYS = '7days',
  THIRTY_DAYS = '30days',
  NEVER = 'never',
}

export class CreateSharedLinkDto {
  @ApiProperty({
    description: 'Link expiration option',
    enum: ExpirationOption,
    example: ExpirationOption.SEVEN_DAYS,
  })
  @IsEnum(ExpirationOption)
  expiresIn!: ExpirationOption;

  @ApiPropertyOptional({
    description: 'Optional password to protect the shared link',
    example: 'secure-password-123',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password?: string;
}
