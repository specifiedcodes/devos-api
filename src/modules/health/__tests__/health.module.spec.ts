import { Test, TestingModule } from '@nestjs/testing';
import { HealthModule } from '../health.module';
import { HealthCheckService } from '../health.service';
import { HealthController } from '../health.controller';
import { HealthHistoryService } from '../health-history.service';
import { HealthMetricsService } from '../health-metrics.service';
import { RedisService } from '../../redis/redis.service';
import { MetricsService } from '../../metrics/metrics.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Registry } from 'prom-client';

describe('HealthModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    const registry = new Registry();

    module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthCheckService,
        HealthHistoryService,
        HealthMetricsService,
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: RedisService,
          useValue: {
            healthCheck: jest.fn().mockResolvedValue(true),
            zadd: jest.fn().mockResolvedValue(1),
            zrangebyscore: jest.fn().mockResolvedValue([]),
            zremrangebyscore: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: getQueueToken('agent-tasks'),
          useValue: {
            isReady: jest.fn().mockResolvedValue(true),
            getJobCounts: jest.fn().mockResolvedValue({
              waiting: 0,
              active: 0,
              completed: 0,
              failed: 0,
              delayed: 0,
            }),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            getRegistry: () => registry,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation(
              (_key: string, defaultValue: any) => defaultValue,
            ),
          },
        },
      ],
    }).compile();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined and can be instantiated', () => {
    expect(module).toBeDefined();
  });

  it('should export HealthCheckService', () => {
    const service = module.get<HealthCheckService>(HealthCheckService);
    expect(service).toBeDefined();
  });

  it('should register HealthController', () => {
    const controller = module.get<HealthController>(HealthController);
    expect(controller).toBeDefined();
  });

  it('should provide HealthHistoryService', () => {
    const service = module.get<HealthHistoryService>(HealthHistoryService);
    expect(service).toBeDefined();
  });

  it('should provide HealthMetricsService', () => {
    const service = module.get<HealthMetricsService>(HealthMetricsService);
    expect(service).toBeDefined();
  });

  it('should have TerminusModule imported in HealthModule definition', () => {
    // Verify the HealthModule imports TerminusModule by checking metadata
    const imports = Reflect.getMetadata('imports', HealthModule);
    expect(imports).toBeDefined();
    // TerminusModule should be in the imports
    const hasTerminus = imports.some((imp: any) => {
      // Check for TerminusModule or DynamicModule from Terminus
      const name = imp?.name || imp?.module?.name;
      return name === 'TerminusModule';
    });
    expect(hasTerminus).toBe(true);
  });
});
