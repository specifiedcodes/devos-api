import { IsOptional, IsString, IsBoolean, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * See create-ip-entry.dto.ts for regex documentation.
 * Service layer performs definitive validation via net.isIPv4()/net.isIPv6().
 */
const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)';
const IP_OR_CIDR_REGEX = new RegExp(
  `^(?:${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}(?:\\/(?:3[0-2]|[12]?\\d))?|[0-9a-fA-F:]+(?:\\/(?:12[0-8]|1[01]\\d|[1-9]?\\d))?)$`,
);

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
