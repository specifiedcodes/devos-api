import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorRequiredResponse {
  @ApiProperty({
    description: 'Indicates that 2FA verification is required',
    example: true,
  })
  requires_2fa!: true;

  @ApiProperty({
    description: 'Temporary token for 2FA verification (5-minute expiration)',
    example: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2',
  })
  temp_token!: string;

  @ApiProperty({
    description: 'Number of unused backup codes remaining',
    example: 10,
    required: false,
  })
  backup_codes_remaining?: number;
}

export class StandardLoginResponse {
  @ApiProperty({
    description: 'User information',
  })
  user!: {
    id: string;
    email: string;
    created_at: string;
  };

  @ApiProperty({
    description: 'JWT authentication tokens',
  })
  tokens!: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

export type LoginResponse = TwoFactorRequiredResponse | StandardLoginResponse;
