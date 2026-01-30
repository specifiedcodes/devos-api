import { ApiProperty } from '@nestjs/swagger';

export class SecurityDashboardDto {
  @ApiProperty({ description: 'Failed login rate in last 24 hours (per hour)' })
  failed_login_rate!: number;

  @ApiProperty({ description: 'Total failed logins in last 24 hours' })
  total_failed_logins!: number;

  @ApiProperty({ description: 'Number of active sessions across all users' })
  active_sessions_count!: number;

  @ApiProperty({ description: '2FA adoption rate as percentage' })
  two_factor_adoption_rate!: number;

  @ApiProperty({ description: 'Number of account lockouts in last 24 hours' })
  account_lockouts!: number;

  @ApiProperty({ description: 'Number of deleted accounts in last 30 days' })
  deleted_accounts!: number;

  @ApiProperty({ description: 'Dashboard generated timestamp' })
  generated_at!: Date;
}
