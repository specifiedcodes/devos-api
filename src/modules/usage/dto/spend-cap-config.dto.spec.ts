import { validate } from 'class-validator';
import { SpendCapConfigDto } from './spend-cap-config.dto';

describe('SpendCapConfigDto', () => {
  it('should accept valid configuration with all fields', async () => {
    const dto = new SpendCapConfigDto();
    dto.spendCapEnabled = true;
    dto.monthlyBudget = 100;
    dto.warningThreshold = 0.70;
    dto.downgradeThreshold = 0.85;
    dto.criticalThreshold = 0.95;
    dto.hardCapThreshold = 1.00;
    dto.downgradeRules = { coding: { from: 'claude-sonnet-4', to: 'deepseek-chat' } };

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should accept when all fields are optional (empty dto)', async () => {
    const dto = new SpendCapConfigDto();
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject warningThreshold > 1.00', async () => {
    const dto = new SpendCapConfigDto();
    dto.warningThreshold = 1.5;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const thresholdError = errors.find((e) => e.property === 'warningThreshold');
    expect(thresholdError).toBeDefined();
  });

  it('should reject warningThreshold < 0.01', async () => {
    const dto = new SpendCapConfigDto();
    dto.warningThreshold = 0;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const thresholdError = errors.find((e) => e.property === 'warningThreshold');
    expect(thresholdError).toBeDefined();
  });

  it('should reject monthlyBudget < 0', async () => {
    const dto = new SpendCapConfigDto();
    dto.monthlyBudget = -10;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const budgetError = errors.find((e) => e.property === 'monthlyBudget');
    expect(budgetError).toBeDefined();
  });

  it('should accept valid downgradeRules object', async () => {
    const dto = new SpendCapConfigDto();
    dto.downgradeRules = {
      coding: { from: 'claude-sonnet-4', to: 'deepseek-chat' },
      planning: { from: 'claude-sonnet-4', to: 'deepseek-chat' },
    };

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid downgradeRules format (non-object)', async () => {
    const dto = new SpendCapConfigDto();
    (dto as any).downgradeRules = 'not-an-object';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept valid thresholds within range', async () => {
    const dto = new SpendCapConfigDto();
    dto.downgradeThreshold = 0.50;
    dto.criticalThreshold = 0.80;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject hardCapThreshold > 1.00', async () => {
    const dto = new SpendCapConfigDto();
    dto.hardCapThreshold = 1.5;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject invalid threshold ordering when only non-warning thresholds provided', async () => {
    const dto = new SpendCapConfigDto();
    dto.downgradeThreshold = 0.90;
    dto.criticalThreshold = 0.80; // Invalid: downgrade > critical

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
