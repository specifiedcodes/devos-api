import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

// Entities
import { ChatRoom } from '../../database/entities/chat-room.entity';
import { ChatRoomMember } from '../../database/entities/chat-room-member.entity';
import { ChatRoomInvitation } from '../../database/entities/chat-room-invitation.entity';
import { UserRoomRestriction } from '../../database/entities/user-room-restriction.entity';
import { ModerationLog } from '../../database/entities/moderation-log.entity';
import { PinnedMessage } from '../../database/entities/pinned-message.entity';
import { ChatMessage } from '../../database/entities/chat-message.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { User } from '../../database/entities/user.entity';

// Controllers
import { ChatRoomController, UserInvitationsController } from './chat-room.controller';

// Services
import { ChatRoomService } from './services/chat-room.service';
import { InvitationService } from './services/invitation.service';
import { ModerationService } from './services/moderation.service';
import { PresenceService } from './services/presence.service';

// Guards
import { ChatPermissionsGuard } from './guards/chat-permissions.guard';

// External modules
import { GuardsModule } from '../../common/guards/guards.module';

/**
 * ChatRoomModule
 * Story 9.10: Multi-User Chat
 *
 * Provides multi-user chat room functionality including:
 * - Room CRUD operations
 * - Member management
 * - Invitations
 * - Moderation (mute, kick, ban, pin)
 * - Real-time presence tracking
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatRoom,
      ChatRoomMember,
      ChatRoomInvitation,
      UserRoomRestriction,
      ModerationLog,
      PinnedMessage,
      ChatMessage,
      WorkspaceMember,
      User,
    ]),
    ScheduleModule.forRoot(),
    ConfigModule,
    GuardsModule,
  ],
  controllers: [ChatRoomController, UserInvitationsController],
  providers: [
    ChatRoomService,
    InvitationService,
    ModerationService,
    PresenceService,
    ChatPermissionsGuard,
  ],
  exports: [
    ChatRoomService,
    InvitationService,
    ModerationService,
    PresenceService,
    ChatPermissionsGuard,
  ],
})
export class ChatRoomModule {}
