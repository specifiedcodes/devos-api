import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Disable2FADto {
  @ApiProperty({
    description: 'Current account password for verification',
    example: 'SecurePass123!',
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
