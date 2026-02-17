import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ValidateAgentDefinitionDto {
  @ApiProperty({ description: 'Agent definition spec to validate' })
  @IsObject()
  @IsNotEmpty()
  definition!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Schema version to validate against', default: 'v1' })
  @IsString()
  @IsOptional()
  schemaVersion?: string;
}
