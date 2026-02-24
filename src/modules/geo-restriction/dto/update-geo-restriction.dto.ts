import {
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ArrayMaxSize,
  IsString,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { GeoRestrictionMode } from '../../../database/entities/geo-restriction.entity';

export class UpdateGeoRestrictionDto {
  @ApiPropertyOptional({
    description: 'Restriction mode: allowlist (only listed countries) or blocklist (block listed countries)',
    enum: GeoRestrictionMode,
    example: 'blocklist',
  })
  @IsOptional()
  @IsEnum(GeoRestrictionMode)
  mode?: GeoRestrictionMode;

  @ApiPropertyOptional({
    description: 'ISO 3166-1 alpha-2 country codes',
    example: ['US', 'GB', 'DE'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @IsString({ each: true })
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'Each country must be a valid ISO 3166-1 alpha-2 code' })
  countries?: string[];

  @ApiPropertyOptional({
    description: 'Enable or disable geo-restriction',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Log-only mode: log blocked attempts without actually blocking',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  logOnly?: boolean;
}
