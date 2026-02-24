import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Regex for validating IPv4 addresses, IPv6 addresses, and CIDR notation.
 * - IPv4: Each octet validated as 0-255
 * - IPv4 CIDR: IPv4/0-32
 * - IPv6: Colon-separated hex groups
 * - IPv6 CIDR: IPv6/0-128
 *
 * Note: This is a first-pass DTO validation. The service layer performs
 * definitive validation via Node.js net.isIPv4()/net.isIPv6().
 */
const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)';
const IP_OR_CIDR_REGEX = new RegExp(
  `^(?:${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}(?:\\/(?:3[0-2]|[12]?\\d))?|[0-9a-fA-F:]+(?:\\/(?:12[0-8]|1[01]\\d|[1-9]?\\d))?)$`,
);

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
