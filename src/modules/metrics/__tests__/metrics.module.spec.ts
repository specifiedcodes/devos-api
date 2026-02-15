import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from '../metrics.controller';
import { MetricsService } from '../metrics.service';
import { AuthMetricsService } from '../services/auth-metrics.service';
import { BusinessMetricsService } from '../services/business-metrics.service';
import { DatabaseMetricsService } from '../services/database-metrics.service';
import { RedisMetricsService } from '../services/redis-metrics.service';
import { QueueMetricsService } from '../services/queue-metrics.service';
import { HttpMetricsInterceptor } from '../interceptors/http-metrics.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';
import { DataSource } from 'typeorm';
import { MetricsModule } from '../metrics.module';

describe('MetricsModule', () => {
  let module: TestingModule;
  let compiledSuccessfully = false;

  const mockRedisService = {
    getConnectionStatus: jest.fn().mockReturnValue(true),
    getInfo: jest.fn().mockResolvedValue(''),
  };

  const mockDataSource = {
    isInitialized: true,
    driver: { master: { totalCount: 0, idleCount: 0, waitingCount: 0 } },
    query: jest.fn().mockResolvedValue([{ count: '0' }]),
  };

  const mockQueue = {
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsService,
        AuthMetricsService,
        BusinessMetricsService,
        DatabaseMetricsService,
        RedisMetricsService,
        QueueMetricsService,
        {
          provide: APP_INTERCEPTOR,
          useClass: HttpMetricsInterceptor,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: 'BullQueue_agent-tasks',
          useValue: mockQueue,
        },
      ],
    }).compile();
    compiledSuccessfully = true;
  });

  afterEach(async () => {
    if (compiledSuccessfully && module) {
      const metricsService = module.get<MetricsService>(MetricsService);
      await metricsService.getRegistry().clear();
      // Close the module to trigger onModuleDestroy and clean up timers
      await module.close();
    }
  });

  it('should compile the module successfully', () => {
    expect(module).toBeDefined();
  });

  it('should have MetricsController defined', () => {
    const controller = module.get<MetricsController>(MetricsController);
    expect(controller).toBeDefined();
  });

  it('should have MetricsService provided', () => {
    const service = module.get<MetricsService>(MetricsService);
    expect(service).toBeDefined();
  });

  it('should have all metric services provided', () => {
    const authMetrics = module.get<AuthMetricsService>(AuthMetricsService);
    const businessMetrics = module.get<BusinessMetricsService>(
      BusinessMetricsService,
    );
    const databaseMetrics = module.get<DatabaseMetricsService>(
      DatabaseMetricsService,
    );
    const redisMetrics = module.get<RedisMetricsService>(RedisMetricsService);
    const queueMetrics = module.get<QueueMetricsService>(QueueMetricsService);

    expect(authMetrics).toBeDefined();
    expect(businessMetrics).toBeDefined();
    expect(databaseMetrics).toBeDefined();
    expect(redisMetrics).toBeDefined();
    expect(queueMetrics).toBeDefined();
  });

  it('should have HttpMetricsInterceptor registered as global interceptor', () => {
    // Verify that MetricsModule metadata includes APP_INTERCEPTOR provider
    // by checking the module's provider metadata directly
    const moduleRef = Reflect.getMetadata('providers', MetricsModule);
    // Note: When using real MetricsModule, the APP_INTERCEPTOR is in providers.
    // In our test we register it directly, so we verify by importing the module definition.
    const hasInterceptor = Array.isArray(moduleRef) && moduleRef.some(
      (p: any) => p?.provide === APP_INTERCEPTOR || p?.useClass === HttpMetricsInterceptor,
    );
    expect(hasInterceptor).toBe(true);
  });

  it('should collect default Prometheus metrics after initialization', async () => {
    const service = module.get<MetricsService>(MetricsService);
    service.onModuleInit();

    const metricsText = await service.getMetrics();
    // Default metrics should include process metrics with devos_ prefix
    expect(metricsText).toContain('devos_');
  });

  it('should set custom labels on metrics (service, environment)', async () => {
    const service = module.get<MetricsService>(MetricsService);
    service.onModuleInit();

    const metricsText = await service.getMetrics();
    expect(metricsText).toContain('service="devos-api"');
  });
});
