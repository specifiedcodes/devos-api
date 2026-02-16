import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AnomalyDetectionService } from './services/anomaly-detection.service';
import { User } from '../../database/entities/user.entity';
import { BackupCode } from '../../database/entities/backup-code.entity';
import { AccountDeletion } from '../../database/entities/account-deletion.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CleanupService } from './tasks/cleanup.service';
import { EmailModule } from '../email/email.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { SsoModule } from '../sso/sso.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, BackupCode, AccountDeletion, SecurityEvent, WorkspaceMember]),
    PassportModule,
    EmailModule,
    WorkspacesModule,
    OnboardingModule,
    forwardRef(() => SsoModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        // Validate JWT_SECRET exists and meets security requirements
        if (!secret) {
          throw new Error(
            'JWT_SECRET is not defined in environment variables. Please set JWT_SECRET in .env file.',
          );
        }

        if (secret.length < 32) {
          throw new Error(
            `JWT_SECRET must be at least 32 characters long for security. Current length: ${secret.length}`,
          );
        }

        return {
          secret,
          signOptions: {
            algorithm: 'HS256', // Required by AC
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginThrottlerGuard,
    JwtStrategy,
    CleanupService,
    AnomalyDetectionService,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
