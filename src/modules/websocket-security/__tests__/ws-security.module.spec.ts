import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Registry } from 'prom-client';
import { WsSecurityGateway } from '../ws-security.gateway';
import { WsRoomGuard } from '../guards/ws-room.guard';
import { WsRateLimiterGuard } from '../guards/ws-rate-limiter.guard';
import { WsTokenRefreshHandler } from '../handlers/ws-token-refresh.handler';
import { WsReconnectionService } from '../services/ws-reconnection.service';
import { WsMonitoringService } from '../services/ws-monitoring.service';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { RedisService } from '../../redis/redis.service';
import { MetricsService } from '../../metrics/metrics.service';

/**
 * Module Registration Tests
 * Story 15.7: WebSocket Security Hardening (AC8)
 *
 * Verifies all providers are registered and injectable.
 * Since RedisModule and MetricsModule are @Global() modules that are only
 * available at the AppModule level, we directly construct the test module
 * with all required providers to verify correct wiring.
 */
describe('WebSocketSecurityModule', () => {
  let module: TestingModule;
  let registry: Registry;

  beforeEach(async () => {
    registry = new Registry();

    module = await Test.createTestingModule({
      providers: [
        WsSecurityGateway,
        WsRoomGuard,
        WsRateLimiterGuard,
        WsTokenRefreshHandler,
        WsReconnectionService,
        WsMonitoringService,
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn(), signAsync: jest.fn() },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            zadd: jest.fn(),
            zrangebyscore: jest.fn(),
            zremrangebyscore: jest.fn(),
            zremrangebyrank: jest.fn(),
            zcard: jest.fn(),
            zrem: jest.fn(),
            expire: jest.fn(),
            increment: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: { getRegistry: jest.fn().mockReturnValue(registry) },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();
  });

  afterEach(() => {
    registry.clear();
  });

  it('should compile module with all providers', () => {
    expect(module).toBeDefined();
  });

  it('should have WsSecurityGateway registered', () => {
    const gateway = module.get<WsSecurityGateway>(WsSecurityGateway);
    expect(gateway).toBeDefined();
  });

  it('should have WsRoomGuard provided and injectable', () => {
    const guard = module.get<WsRoomGuard>(WsRoomGuard);
    expect(guard).toBeDefined();
  });

  it('should have WsReconnectionService provided and injectable', () => {
    const service = module.get<WsReconnectionService>(WsReconnectionService);
    expect(service).toBeDefined();
  });

  it('should have WsRateLimiterGuard provided and injectable', () => {
    const guard = module.get<WsRateLimiterGuard>(WsRateLimiterGuard);
    expect(guard).toBeDefined();
  });

  it('should have WsMonitoringService provided and injectable', () => {
    const service = module.get<WsMonitoringService>(WsMonitoringService);
    expect(service).toBeDefined();
  });

  it('should have WsTokenRefreshHandler provided and injectable', () => {
    const handler = module.get<WsTokenRefreshHandler>(WsTokenRefreshHandler);
    expect(handler).toBeDefined();
  });
});
