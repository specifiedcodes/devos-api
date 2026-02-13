import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { RoleGuard } from './role.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceMember, SecurityEvent]),
  ],
  providers: [RoleGuard],
  exports: [RoleGuard, TypeOrmModule],
})
export class GuardsModule {}
