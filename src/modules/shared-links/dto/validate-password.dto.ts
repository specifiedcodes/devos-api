import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidatePasswordDto {
  @ApiProperty({
    description: 'Password to validate against the shared link',
    example: 'secure-password-123',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
