import { ApiProperty } from '@nestjs/swagger';

export class SessionDto {
  @ApiProperty({ description: 'Session ID' })
  session_id!: string;

  @ApiProperty({ description: 'Session created timestamp' })
  created_at!: Date;

  @ApiProperty({ description: 'Session expiration timestamp' })
  expires_at!: Date;

  @ApiProperty({ description: 'Last activity timestamp' })
  last_active!: Date;

  @ApiProperty({ description: 'IP address of session' })
  ip_address!: string;

  @ApiProperty({ description: 'User agent (browser/device)' })
  user_agent!: string;

  @ApiProperty({ description: 'Whether this is the current session' })
  is_current!: boolean;
}
