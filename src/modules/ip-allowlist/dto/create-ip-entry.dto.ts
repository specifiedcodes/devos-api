import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Regex for validating IPv4 addresses, IPv6 addresses, and CIDR notation.
 * - IPv4: 0-255.0-255.0-255.0-255
 * - IPv4 CIDR: 0-255.0-255.0-255.0-255/0-32
 * - IPv6: Colon-separated hex groups
 * - IPv6 CIDR: IPv6/0-128
 */
const IP_OR_CIDR_REGEX = /^(?:(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?|[0-9a-fA-F:]+(?:\/\d{1,3})?)$/;

export class CreateIpEntryDto {
  @ApiProperty({
    description: 'IP address (IPv4/IPv6) or CIDR range',
    example: '203.0.113.50',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(45)
  @Matches(IP_OR_CIDR_REGEX, {
    message: 'Must be a valid IP address or CIDR notation (e.g., 203.0.113.50 or 10.0.0.0/8)',
  })
  ipAddress!: string;

  @ApiProperty({
    description: 'Human-readable description of this IP entry',
    example: 'Office VPN - San Francisco',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  description!: string;
}
