import { validate } from 'class-validator';
import { AnalyticsQueryDto, AnalyticsExportQueryDto } from '../dto/analytics-query.dto';

describe('AnalyticsQueryDto', () => {
  it('should have default range of 30d', () => {
    const dto = new AnalyticsQueryDto();
    expect(dto.range).toBe('30d');
  });

  it('should accept valid range values (today, 7d, 30d, 90d, custom)', async () => {
    for (const range of ['today', '7d', '30d', '90d', 'custom'] as const) {
      const dto = new AnalyticsQueryDto();
      dto.range = range;
      if (range === 'custom') {
        dto.startDate = '2026-01-01T00:00:00.000Z';
        dto.endDate = '2026-01-31T23:59:59.000Z';
      }
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('should reject invalid range value', async () => {
    const dto = new AnalyticsQueryDto();
    (dto as any).range = 'invalid';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid ISO8601 startDate', async () => {
    const dto = new AnalyticsQueryDto();
    dto.range = 'custom';
    dto.startDate = '2026-01-01T00:00:00.000Z';
    dto.endDate = '2026-01-31T23:59:59.000Z';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid startDate format when range is custom', async () => {
    const dto = new AnalyticsQueryDto();
    dto.range = 'custom';
    dto.startDate = 'not-a-date';
    dto.endDate = '2026-01-31T23:59:59.000Z';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject invalid endDate format when range is custom', async () => {
    const dto = new AnalyticsQueryDto();
    dto.range = 'custom';
    dto.startDate = '2026-01-01T00:00:00.000Z';
    dto.endDate = 'not-a-date';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject custom range without startDate', async () => {
    const dto = new AnalyticsQueryDto();
    dto.range = 'custom';
    dto.endDate = '2026-01-31T23:59:59.000Z';
    // startDate is undefined
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('should reject custom range without endDate', async () => {
    const dto = new AnalyticsQueryDto();
    dto.range = 'custom';
    dto.startDate = '2026-01-01T00:00:00.000Z';
    // endDate is undefined
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'endDate')).toBe(true);
  });

  describe('computeDateRange', () => {
    it('should compute today range', () => {
      const dto = new AnalyticsQueryDto();
      dto.range = 'today';
      const { startDate, endDate } = dto.computeDateRange();
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
    });

    it('should compute 7d range', () => {
      const dto = new AnalyticsQueryDto();
      dto.range = '7d';
      const { startDate, endDate } = dto.computeDateRange();
      const diff = endDate.getTime() - startDate.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      expect(days).toBeCloseTo(7, 0);
    });

    it('should compute 30d range', () => {
      const dto = new AnalyticsQueryDto();
      dto.range = '30d';
      const { startDate, endDate } = dto.computeDateRange();
      const diff = endDate.getTime() - startDate.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      expect(days).toBeCloseTo(30, 0);
    });

    it('should compute 90d range', () => {
      const dto = new AnalyticsQueryDto();
      dto.range = '90d';
      const { startDate, endDate } = dto.computeDateRange();
      const diff = endDate.getTime() - startDate.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      expect(days).toBeCloseTo(90, 0);
    });

    it('should use custom dates when range is custom', () => {
      const dto = new AnalyticsQueryDto();
      dto.range = 'custom';
      dto.startDate = '2026-01-01T00:00:00.000Z';
      dto.endDate = '2026-01-15T23:59:59.000Z';
      const { startDate, endDate } = dto.computeDateRange();
      expect(startDate.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(endDate.toISOString()).toBe('2026-01-15T23:59:59.000Z');
    });
  });
});

describe('AnalyticsExportQueryDto', () => {
  it('should have default metric of all', () => {
    const dto = new AnalyticsExportQueryDto();
    expect(dto.metric).toBe('all');
  });

  it('should accept valid metric values', async () => {
    for (const metric of ['users', 'projects', 'agents', 'ai-usage', 'all'] as const) {
      const dto = new AnalyticsExportQueryDto();
      dto.metric = metric;
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('should reject invalid metric value', async () => {
    const dto = new AnalyticsExportQueryDto();
    (dto as any).metric = 'invalid';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
