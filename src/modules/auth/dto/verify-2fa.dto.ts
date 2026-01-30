import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Verify2FADto {
  @ApiProperty({
    description: 'Temporary verification token from login response',
    example: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2',
  })
  @IsString()
  @Length(64, 64, { message: 'Invalid temp token format' })
  temp_token!: string;

  @ApiProperty({
    description: '6-digit TOTP code from authenticator app',
    example: '123456',
  })
  @IsString()
  @Length(6, 6, { message: 'Code must be 6 digits' })
  @Matches(/^[0-9]+$/, { message: 'Code must contain only numbers' })
  code!: string;
}
