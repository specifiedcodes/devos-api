import { IsOptional, IsString, IsBoolean, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const IP_OR_CIDR_REGEX = /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?|[0-9a-fA-F:]+(?:\/\d{1,3})?)$/;

export class UpdateIpEntryDto {
  @ApiPropertyOptional({
    description: 'Updated IP address or CIDR range',
    example: '10.0.0.0/16',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Matches(IP_OR_CIDR_REGEX, {
    message: 'Must be a valid IP address or CIDR notation',
  })
  ipAddress?: string;

  @ApiPropertyOptional({
    description: 'Updated description',
    example: 'Office VPN - New York',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    description: 'Enable or disable this entry',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
