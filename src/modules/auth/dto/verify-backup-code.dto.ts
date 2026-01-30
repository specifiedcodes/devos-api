import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyBackupCodeDto {
  @ApiProperty({
    description: 'Temporary verification token from login response',
    example: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2',
  })
  @IsString()
  @Length(64, 64, { message: 'Invalid temp token format' })
  temp_token!: string;

  @ApiProperty({
    description: '10-character backup code',
    example: 'A1B2C3D4E5',
  })
  @IsString()
  @Length(10, 10, { message: 'Backup code must be 10 characters' })
  @Matches(/^[A-Z0-9]+$/i, { message: 'Backup code must be alphanumeric' })
  backup_code!: string;
}
