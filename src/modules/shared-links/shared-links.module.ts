import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { SharedLinksController } from './controllers/shared-links.controller';
import { SharedViewController } from './controllers/shared-view.controller';
import { SharedLinksService } from './services/shared-links.service';
import { SharedLink } from '../../database/entities/shared-link.entity';
import { Project } from '../../database/entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SharedLink, Project]),
    ThrottlerModule.forRoot([
      {
        name: 'password-validation',
        ttl: parseInt(process.env.SHARED_LINK_PASSWORD_RATE_WINDOW || '900', 10) * 1000,
        limit: parseInt(process.env.SHARED_LINK_PASSWORD_RATE_LIMIT || '5', 10),
      },
    ]),
  ],
  controllers: [SharedLinksController, SharedViewController],
  providers: [SharedLinksService],
  exports: [SharedLinksService],
})
export class SharedLinksModule {}
