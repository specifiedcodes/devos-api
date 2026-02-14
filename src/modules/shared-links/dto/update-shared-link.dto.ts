import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpirationOption } from './create-shared-link.dto';

export class UpdateSharedLinkDto {
  @ApiPropertyOptional({
    description: 'New expiration option (recalculated from now)',
    enum: ExpirationOption,
    example: ExpirationOption.THIRTY_DAYS,
  })
  @IsOptional()
  @IsEnum(ExpirationOption)
  expiresIn?: ExpirationOption;

  @ApiPropertyOptional({
    description: 'New password (set to empty string to remove password)',
    example: 'new-secure-password',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password?: string;
}
