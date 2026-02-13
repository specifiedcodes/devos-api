/**
 * Kanban Preferences Module
 * Story 7.8: Kanban Board Customization
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserKanbanPreferences } from '../../database/entities/user-kanban-preferences.entity';
import { UserKanbanPreferencesService } from './services/user-kanban-preferences.service';
import { UserKanbanPreferencesController } from './controllers/user-kanban-preferences.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserKanbanPreferences]),
    AuthModule,
  ],
  controllers: [UserKanbanPreferencesController],
  providers: [UserKanbanPreferencesService],
  exports: [UserKanbanPreferencesService],
})
export class KanbanPreferencesModule {}
