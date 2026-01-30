import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Verify2FASetupDto {
  @ApiProperty({
    description: '6-digit verification code from authenticator app',
    example: '123456',
  })
  @IsString()
  @Length(6, 6, { message: 'Verification code must be 6 digits' })
  @Matches(/^[0-9]+$/, {
    message: 'Verification code must contain only numbers',
  })
  code!: string;
}
