import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from '../metrics.controller';
import { MetricsService } from '../metrics.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: MetricsService;

  const mockMetricsOutput = [
    '# HELP devos_http_requests_total Total number of HTTP requests',
    '# TYPE devos_http_requests_total counter',
    'devos_http_requests_total{method="GET",route="/api/projects",status_code="200"} 42',
    '# HELP devos_process_cpu_user_seconds_total Total user CPU time spent in seconds.',
    '# TYPE devos_process_cpu_user_seconds_total counter',
    'devos_process_cpu_user_seconds_total 0.5',
  ].join('\n');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: MetricsService,
          useValue: {
            getMetrics: jest.fn().mockResolvedValue(mockMetricsOutput),
            getContentType: jest
              .fn()
              .mockReturnValue(
                'text/plain; version=0.0.4; charset=utf-8',
              ),
          },
        },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /metrics', () => {
    it('should return 200 with text/plain content type', async () => {
      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      };

      await controller.getMetrics(mockRes as any);

      expect(mockRes.set).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; version=0.0.4; charset=utf-8',
      );
      expect(mockRes.end).toHaveBeenCalledWith(mockMetricsOutput);
    });

    it('should return Prometheus text format containing default metrics', async () => {
      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      };

      await controller.getMetrics(mockRes as any);

      const metricsContent = mockRes.end.mock.calls[0][0];
      expect(metricsContent).toContain('devos_process_cpu_user_seconds_total');
    });

    it('should include custom devos_ prefixed metrics', async () => {
      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      };

      await controller.getMetrics(mockRes as any);

      const metricsContent = mockRes.end.mock.calls[0][0];
      expect(metricsContent).toContain('devos_http_requests_total');
    });

    it('should call metricsService.getMetrics()', async () => {
      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      };

      await controller.getMetrics(mockRes as any);

      expect(metricsService.getMetrics).toHaveBeenCalled();
    });
  });
});
