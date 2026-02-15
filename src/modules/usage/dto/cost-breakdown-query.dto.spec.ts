import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CostBreakdownQueryDto, CostGroupBy } from './cost-breakdown-query.dto';

describe('CostBreakdownQueryDto', () => {
  async function validateDto(data: Record<string, any>) {
    const dto = plainToInstance(CostBreakdownQueryDto, data);
    return validate(dto);
  }

  describe('CostGroupBy enum', () => {
    it('should have correct values', () => {
      expect(CostGroupBy.MODEL).toBe('model');
      expect(CostGroupBy.PROVIDER).toBe('provider');
      expect(CostGroupBy.TASK_TYPE).toBe('taskType');
      expect(CostGroupBy.AGENT).toBe('agent');
      expect(CostGroupBy.PROJECT).toBe('project');
    });
  });

  describe('groupBy validation', () => {
    it('should accept valid CostGroupBy values', async () => {
      for (const value of Object.values(CostGroupBy)) {
        const errors = await validateDto({ groupBy: value });
        expect(errors.length).toBe(0);
      }
    });

    it('should reject invalid groupBy values', async () => {
      const errors = await validateDto({ groupBy: 'invalid' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('groupBy');
    });

    it('should allow groupBy to be optional', async () => {
      const errors = await validateDto({});
      expect(errors.length).toBe(0);
    });
  });

  describe('date validation', () => {
    it('should accept valid ISO date strings for startDate', async () => {
      const errors = await validateDto({ startDate: '2026-01-01' });
      expect(errors.length).toBe(0);
    });

    it('should accept valid ISO date strings for endDate', async () => {
      const errors = await validateDto({ endDate: '2026-01-31' });
      expect(errors.length).toBe(0);
    });

    it('should accept full ISO datetime strings', async () => {
      const errors = await validateDto({
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-31T23:59:59.999Z',
      });
      expect(errors.length).toBe(0);
    });

    it('should reject invalid date strings', async () => {
      const errors = await validateDto({ startDate: 'not-a-date' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('startDate');
    });

    it('should allow dates to be optional', async () => {
      const errors = await validateDto({});
      expect(errors.length).toBe(0);
    });
  });

  describe('combined validation', () => {
    it('should accept all valid fields together', async () => {
      const errors = await validateDto({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        groupBy: CostGroupBy.PROVIDER,
      });
      expect(errors.length).toBe(0);
    });

    it('should accept empty dto (all optional)', async () => {
      const errors = await validateDto({});
      expect(errors.length).toBe(0);
    });
  });
});
