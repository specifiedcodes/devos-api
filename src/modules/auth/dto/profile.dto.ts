import { ApiProperty } from '@nestjs/swagger';

export class ProfileDto {
  @ApiProperty({ description: 'User ID' })
  id!: string;

  @ApiProperty({ description: 'User email address' })
  email!: string;

  @ApiProperty({ description: 'Account creation timestamp' })
  created_at!: Date;

  @ApiProperty({ description: 'Last login timestamp', nullable: true })
  last_login_at!: Date | null;

  @ApiProperty({ description: 'Whether 2FA is enabled' })
  two_factor_enabled!: boolean;
}
