import {
  IsOptional,
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BackgroundType } from '../../../database/entities/white-label-config.entity';
import { CustomLinkDto } from './custom-link.dto';

export class UpdateLoginPageConfigDto {
  @IsOptional()
  @IsBoolean()
  showDevosBranding?: boolean;

  @IsOptional()
  @IsEnum(BackgroundType)
  backgroundType?: BackgroundType;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  backgroundValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[^<>&"']+$/, { message: 'Hero text must not contain HTML special characters' })
  heroText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^[^<>&"']+$/, { message: 'Hero subtext must not contain HTML special characters' })
  heroSubtext?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'Maximum 10 custom links allowed' })
  @ValidateNested({ each: true })
  @Type(() => CustomLinkDto)
  customLinks?: CustomLinkDto[];

  @IsOptional()
  @IsBoolean()
  showSignup?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  loginPageCss?: string | null;
}
