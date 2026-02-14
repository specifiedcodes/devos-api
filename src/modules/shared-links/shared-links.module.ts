import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedLinksController } from './controllers/shared-links.controller';
import { SharedViewController } from './controllers/shared-view.controller';
import { SharedLinksService } from './services/shared-links.service';
import { SharedLink } from '../../database/entities/shared-link.entity';
import { Project } from '../../database/entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SharedLink, Project]),
  ],
  controllers: [SharedLinksController, SharedViewController],
  providers: [SharedLinksService],
  exports: [SharedLinksService],
})
export class SharedLinksModule {}
