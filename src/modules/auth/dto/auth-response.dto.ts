import { ApiProperty } from '@nestjs/swagger';

class UserDto {
  @ApiProperty({ example: 'uuid-string' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: '2026-01-30T12:00:00Z' })
  created_at!: string;
}

class TokensDto {
  @ApiProperty({ example: 'jwt-access-token...' })
  access_token!: string;

  @ApiProperty({ example: 'jwt-refresh-token...' })
  refresh_token!: string;

  @ApiProperty({ example: 86400, description: 'Expires in seconds (24 hours)' })
  expires_in!: number;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserDto })
  user!: UserDto;

  @ApiProperty({ type: TokensDto })
  tokens!: TokensDto;
}
