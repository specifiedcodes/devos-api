import { validate } from 'class-validator';
import { ExportUsageDto } from './export-usage.dto';

describe('ExportUsageDto', () => {
  it('should pass validation with valid date range', async () => {
    const dto = new ExportUsageDto();
    dto.startDate = '2024-01-01';
    dto.endDate = '2024-01-31';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when end date is before start date', async () => {
    const dto = new ExportUsageDto();
    dto.startDate = '2024-01-31';
    dto.endDate = '2024-01-01';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isAfterStartDate');
  });

  it('should fail validation when date range exceeds 365 days', async () => {
    const dto = new ExportUsageDto();
    dto.startDate = '2024-01-01';
    dto.endDate = '2025-02-01'; // More than 1 year

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isValidDateRange');
  });

  it('should pass validation with exactly 365 days range', async () => {
    const dto = new ExportUsageDto();
    dto.startDate = '2024-01-01';
    dto.endDate = '2024-12-31';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation with invalid date format', async () => {
    const dto = new ExportUsageDto();
    dto.startDate = 'invalid-date';
    dto.endDate = '2024-01-31';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail validation when dates are missing', async () => {
    const dto = new ExportUsageDto();

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should allow same start and end date', async () => {
    const dto = new ExportUsageDto();
    dto.startDate = '2024-01-01';
    dto.endDate = '2024-01-01';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
