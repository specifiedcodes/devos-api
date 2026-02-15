import { validate } from 'class-validator';
import { SpendCapOverrideDto } from './spend-cap-override.dto';

describe('SpendCapOverrideDto', () => {
  it('should accept valid override with forcePremiumOverride=true', async () => {
    const dto = new SpendCapOverrideDto();
    dto.forcePremiumOverride = true;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept valid override with autoDowngradePaused=true', async () => {
    const dto = new SpendCapOverrideDto();
    dto.autoDowngradePaused = true;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept valid increaseBudgetTo value', async () => {
    const dto = new SpendCapOverrideDto();
    dto.increaseBudgetTo = 200;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject negative increaseBudgetTo', async () => {
    const dto = new SpendCapOverrideDto();
    dto.increaseBudgetTo = -50;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const budgetError = errors.find((e) => e.property === 'increaseBudgetTo');
    expect(budgetError).toBeDefined();
  });

  it('should reject zero increaseBudgetTo', async () => {
    const dto = new SpendCapOverrideDto();
    dto.increaseBudgetTo = 0;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const budgetError = errors.find((e) => e.property === 'increaseBudgetTo');
    expect(budgetError).toBeDefined();
  });

  it('should accept when all fields are optional (empty dto)', async () => {
    const dto = new SpendCapOverrideDto();
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept all fields together', async () => {
    const dto = new SpendCapOverrideDto();
    dto.forcePremiumOverride = false;
    dto.autoDowngradePaused = true;
    dto.increaseBudgetTo = 500;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject non-boolean forcePremiumOverride', async () => {
    const dto = new SpendCapOverrideDto();
    (dto as any).forcePremiumOverride = 'yes';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject non-number increaseBudgetTo', async () => {
    const dto = new SpendCapOverrideDto();
    (dto as any).increaseBudgetTo = 'two hundred';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
