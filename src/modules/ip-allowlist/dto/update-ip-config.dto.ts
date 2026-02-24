import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateIpConfigDto {
  @ApiProperty({
    description: 'Enable or disable IP allowlisting for this workspace',
    example: true,
  })
  @IsBoolean()
  isEnabled!: boolean;
}
