import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { Agent } from '../../database/entities/agent.entity';
import { Project } from '../../database/entities/project.entity';
import { Story } from '../../database/entities/story.entity';
import { IntegrationConnection } from '../../database/entities/integration-connection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Agent, Project, Story, IntegrationConnection])],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
