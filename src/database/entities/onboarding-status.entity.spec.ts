import { validate } from 'class-validator';
import { OnboardingStatus, OnboardingStatusEnum } from './onboarding-status.entity';

describe('OnboardingStatus Entity', () => {
  describe('Validation', () => {
    it('should validate a valid onboarding status entity', async () => {
      const onboardingStatus = new OnboardingStatus();
      onboardingStatus.userId = '123e4567-e89b-12d3-a456-426614174000';
      onboardingStatus.workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      onboardingStatus.status = OnboardingStatusEnum.IN_PROGRESS;
      onboardingStatus.accountCreated = true;
      onboardingStatus.githubConnected = false;
      onboardingStatus.deploymentConfigured = false;
      onboardingStatus.databaseConfigured = false;
      onboardingStatus.aiKeyAdded = false;
      onboardingStatus.firstProjectCreated = false;
      onboardingStatus.tutorialCompleted = false;
      onboardingStatus.currentStep = 'service_connections';
      onboardingStatus.startedAt = new Date();
      onboardingStatus.completedAt = null;

      const errors = await validate(onboardingStatus);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when userId is missing', async () => {
      const onboardingStatus = new OnboardingStatus();
      onboardingStatus.workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      onboardingStatus.status = OnboardingStatusEnum.IN_PROGRESS;

      const errors = await validate(onboardingStatus);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'userId')).toBe(true);
    });

    it('should fail validation when workspaceId is missing', async () => {
      const onboardingStatus = new OnboardingStatus();
      onboardingStatus.userId = '123e4567-e89b-12d3-a456-426614174000';
      onboardingStatus.status = OnboardingStatusEnum.IN_PROGRESS;

      const errors = await validate(onboardingStatus);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'workspaceId')).toBe(true);
    });

    it('should fail validation when userId is not a UUID', async () => {
      const onboardingStatus = new OnboardingStatus();
      onboardingStatus.userId = 'invalid-uuid';
      onboardingStatus.workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      onboardingStatus.status = OnboardingStatusEnum.IN_PROGRESS;

      const errors = await validate(onboardingStatus);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'userId')).toBe(true);
    });

    it('should fail validation when workspaceId is not a UUID', async () => {
      const onboardingStatus = new OnboardingStatus();
      onboardingStatus.userId = '123e4567-e89b-12d3-a456-426614174000';
      onboardingStatus.workspaceId = 'invalid-uuid';
      onboardingStatus.status = OnboardingStatusEnum.IN_PROGRESS;

      const errors = await validate(onboardingStatus);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'workspaceId')).toBe(true);
    });

    it('should fail validation when status is not a valid enum value', async () => {
      const onboardingStatus = new OnboardingStatus();
      onboardingStatus.userId = '123e4567-e89b-12d3-a456-426614174000';
      onboardingStatus.workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      (onboardingStatus as any).status = 'invalid_status';

      const errors = await validate(onboardingStatus);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'status')).toBe(true);
    });

    it('should fail validation when currentStep exceeds max length', async () => {
      const onboardingStatus = new OnboardingStatus();
      onboardingStatus.userId = '123e4567-e89b-12d3-a456-426614174000';
      onboardingStatus.workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      onboardingStatus.status = OnboardingStatusEnum.IN_PROGRESS;
      onboardingStatus.currentStep = 'a'.repeat(51); // Exceeds 50 char limit

      const errors = await validate(onboardingStatus);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'currentStep')).toBe(true);
    });
  });

  describe('Default Values', () => {
    it('should have correct default values for step booleans', () => {
      const onboardingStatus = new OnboardingStatus();

      // Note: Defaults are applied by the database, not the entity
      // We're testing that the entity structure supports these defaults
      expect(onboardingStatus.accountCreated).toBeUndefined();
      expect(onboardingStatus.githubConnected).toBeUndefined();
      expect(onboardingStatus.deploymentConfigured).toBeUndefined();
      expect(onboardingStatus.databaseConfigured).toBeUndefined();
      expect(onboardingStatus.aiKeyAdded).toBeUndefined();
      expect(onboardingStatus.firstProjectCreated).toBeUndefined();
      expect(onboardingStatus.tutorialCompleted).toBeUndefined();
    });
  });

  describe('Enum Values', () => {
    it('should have correct OnboardingStatusEnum values', () => {
      expect(OnboardingStatusEnum.NOT_STARTED).toBe('not_started');
      expect(OnboardingStatusEnum.IN_PROGRESS).toBe('in_progress');
      expect(OnboardingStatusEnum.COMPLETED).toBe('completed');
    });
  });
});
