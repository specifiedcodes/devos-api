import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class ImportAgentDefinitionDto {
  @ApiProperty({ description: 'YAML or JSON content string to import' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiProperty({ description: 'Format of the content', enum: ['yaml', 'json'] })
  @IsString()
  @IsIn(['yaml', 'json'])
  format!: 'yaml' | 'json';
}
