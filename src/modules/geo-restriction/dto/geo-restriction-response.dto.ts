import { ApiProperty } from '@nestjs/swagger';
import { GeoRestriction, GeoRestrictionMode } from '../../../database/entities/geo-restriction.entity';

export class GeoRestrictionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty({ enum: GeoRestrictionMode }) mode!: GeoRestrictionMode;
  @ApiProperty({ type: [String] }) countries!: string[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() logOnly!: boolean;
  @ApiProperty({ nullable: true }) createdBy!: string | null;
  @ApiProperty({ nullable: true }) lastModifiedBy!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(entity: GeoRestriction): GeoRestrictionResponseDto {
    const dto = new GeoRestrictionResponseDto();
    dto.id = entity.id;
    dto.workspaceId = entity.workspaceId;
    dto.mode = entity.mode;
    dto.countries = entity.countries;
    dto.isActive = entity.isActive;
    dto.logOnly = entity.logOnly;
    dto.createdBy = entity.createdBy;
    dto.lastModifiedBy = entity.lastModifiedBy;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

export class GeoTestResponseDto {
  @ApiProperty({ description: 'Client IP address' })
  ipAddress!: string;

  @ApiProperty({ description: 'Detected ISO 3166-1 alpha-2 country code', nullable: true })
  detectedCountry!: string | null;

  @ApiProperty({ description: 'Whether the detected location is allowed' })
  isAllowed!: boolean;

  @ApiProperty({ description: 'Whether the geo-restriction feature is active' })
  isActive!: boolean;

  @ApiProperty({ description: 'Whether geo-restriction is in log-only mode' })
  isLogOnly!: boolean;

  @ApiProperty({ description: 'Whether the GeoIP database is available' })
  geoIpAvailable!: boolean;

  @ApiProperty({ description: 'Reason for the result', nullable: true })
  reason!: string | null;
}

export class GeoBlockedAttemptDto {
  @ApiProperty() ipAddress!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty({ nullable: true }) detectedCountry!: string | null;
  @ApiProperty() timestamp!: string;
  @ApiProperty() endpoint!: string;
}

export class GeoIpDatabaseInfoDto {
  @ApiProperty() available!: boolean;
  @ApiProperty({ nullable: true }) buildDate!: string | null;
  @ApiProperty({ nullable: true }) type!: string | null;
}

export class CountryInfoDto {
  @ApiProperty({ description: 'ISO 3166-1 alpha-2 code' }) code!: string;
  @ApiProperty({ description: 'Country name' }) name!: string;
}
