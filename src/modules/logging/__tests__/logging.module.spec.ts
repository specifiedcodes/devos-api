jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-v4'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { LoggingModule } from '../logging.module';
import { LoggingService } from '../logging.service';
import { CorrelationIdMiddleware } from '../middleware/correlation-id.middleware';

describe('LoggingModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [LoggingModule],
    }).compile();
  });

  it('should be defined and can be instantiated', () => {
    expect(module).toBeDefined();
  });

  it('should export LoggingService', () => {
    const service = module.get<LoggingService>(LoggingService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(LoggingService);
  });

  it('should provide CorrelationIdMiddleware', () => {
    const middleware = module.get<CorrelationIdMiddleware>(CorrelationIdMiddleware);
    expect(middleware).toBeDefined();
    expect(middleware).toBeInstanceOf(CorrelationIdMiddleware);
  });
});
