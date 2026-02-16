import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { WsSecurityGateway } from './ws-security.gateway';
import { WsRoomGuard } from './guards/ws-room.guard';
import { WsRateLimiterGuard } from './guards/ws-rate-limiter.guard';
import { WsTokenRefreshHandler } from './handlers/ws-token-refresh.handler';
import { WsReconnectionService } from './services/ws-reconnection.service';
import { WsMonitoringService } from './services/ws-monitoring.service';

/**
 * WebSocket Security Module
 * Story 15.7: WebSocket Security Hardening (AC8)
 *
 * Registers all WebSocket security providers, the gateway,
 * and imports required modules (JWT, TypeORM, Redis, Metrics).
 * Redis and Metrics modules are global so they don't need explicit imports.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET', 'devos-jwt-secret'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRY', '24h'),
        },
      }),
    }),
    TypeOrmModule.forFeature([WorkspaceMember]),
  ],
  providers: [
    WsSecurityGateway,
    WsRoomGuard,
    WsRateLimiterGuard,
    WsTokenRefreshHandler,
    WsReconnectionService,
    WsMonitoringService,
  ],
  exports: [
    WsRoomGuard,
    WsRateLimiterGuard,
    WsTokenRefreshHandler,
    WsReconnectionService,
    WsMonitoringService,
  ],
})
export class WebSocketSecurityModule {}
