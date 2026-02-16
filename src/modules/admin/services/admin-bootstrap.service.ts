import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    const adminEmail = this.configService.get<string>('PLATFORM_ADMIN_EMAIL');

    if (!adminEmail) {
      this.logger.log('[AdminBootstrap] No PLATFORM_ADMIN_EMAIL configured');
      return;
    }

    try {
      const user = await this.userRepository.findOne({
        where: { email: adminEmail },
      });

      if (!user) {
        this.logger.warn(
          `[AdminBootstrap] User with email ${adminEmail} not found. Will promote when user registers.`,
        );
        return;
      }

      if (user.isPlatformAdmin) {
        this.logger.log(
          `[AdminBootstrap] ${adminEmail} is already a platform admin`,
        );
        return;
      }

      user.isPlatformAdmin = true;
      await this.userRepository.save(user);

      this.logger.log(
        `[AdminBootstrap] Promoted ${adminEmail} to platform admin`,
      );
    } catch (error) {
      this.logger.error(
        `[AdminBootstrap] Failed to promote admin: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
