import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OnboardingService } from './onboarding.service';
import {
  OnboardingStatus,
  OnboardingStatusEnum,
} from '../../../database/entities/onboarding-status.entity';
import { NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../shared/audit/audit.service';
import { AnalyticsEventsService } from '../../analytics/services/analytics-events.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let repository: Repository<OnboardingStatus>;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockAnalyticsEventsService = {
    logEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockDataSource = {
    transaction: jest.fn((callback) => {
      // Mock transaction by calling callback with a manager that returns mockRepository
      const mockManager = {
        getRepository: jest.fn(() => mockRepository),
      };
      return callback(mockManager);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        {
          provide: getRepositoryToken(OnboardingStatus),
          useValue: mockRepository,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: AnalyticsEventsService,
          useValue: mockAnalyticsEventsService,
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
    repository = module.get<Repository<OnboardingStatus>>(
      getRepositoryToken(OnboardingStatus),
    );

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOnboardingStatus', () => {
    it('should create onboarding status with correct initial values', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        githubConnected: false,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: false,
        firstProjectCreated: false,
        tutorialCompleted: false,
        currentStep: 'service_connections',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(mockOnboarding);
      mockRepository.save.mockResolvedValue(mockOnboarding);

      const result = await service.createOnboardingStatus(userId, workspaceId);

      expect(mockRepository.create).toHaveBeenCalledWith({
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        currentStep: 'service_connections',
        startedAt: expect.any(Date),
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.status).toBe(OnboardingStatusEnum.IN_PROGRESS);
      expect(result.accountCreated).toBe(true);
      expect(result.currentStep).toBe('service_connections');
    });

    it('should return existing onboarding if already exists (idempotent)', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const existingOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        githubConnected: false,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: false,
        firstProjectCreated: false,
        tutorialCompleted: false,
        currentStep: 'service_connections',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(existingOnboarding);

      const result = await service.createOnboardingStatus(userId, workspaceId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId, workspaceId },
      });
      expect(result).toEqual(existingOnboarding);
      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getOnboardingStatus', () => {
    it('should return onboarding status with computed fields', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        githubConnected: false,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: false,
        firstProjectCreated: false,
        tutorialCompleted: false,
        currentStep: 'service_connections',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockOnboarding);

      const result = await service.getOnboardingStatus(userId, workspaceId);

      expect(result.steps).toEqual({
        accountCreated: true,
        githubConnected: false,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: false,
        firstProjectCreated: false,
        tutorialCompleted: false,
      });
      expect(result.currentStep).toBe('service_connections');
      expect(result.isComplete).toBe(false);
      expect(result.completionPercentage).toBeGreaterThan(0);
      expect(result.nextStep).toBeDefined();
    });

    it('should throw NotFoundException when onboarding status not found', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getOnboardingStatus(userId, workspaceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should correctly calculate completion percentage', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        githubConnected: true,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: true,
        firstProjectCreated: false,
        tutorialCompleted: false,
        currentStep: 'create_project',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockOnboarding);

      const result = await service.getOnboardingStatus(userId, workspaceId);

      // 3 out of 7 steps complete = ~43%
      expect(result.completionPercentage).toBeGreaterThanOrEqual(40);
      expect(result.completionPercentage).toBeLessThanOrEqual(45);
    });
  });

  describe('updateStep', () => {
    it('should update a step and return updated status', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        githubConnected: false,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: false,
        firstProjectCreated: false,
        tutorialCompleted: false,
        currentStep: 'service_connections',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockOnboarding);
      mockRepository.save.mockResolvedValue({
        ...mockOnboarding,
        aiKeyAdded: true,
        currentStep: 'create_project',
      });

      const result = await service.updateStep(
        userId,
        workspaceId,
        'aiKeyAdded',
        true,
      );

      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.aiKeyAdded).toBe(true);
      expect(result.currentStep).toBe('create_project');
    });

    it('should mark status as completed when all required steps are done', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        githubConnected: false,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: true,
        firstProjectCreated: false,
        tutorialCompleted: false,
        currentStep: 'create_project',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockOnboarding);
      mockRepository.save.mockResolvedValue({
        ...mockOnboarding,
        firstProjectCreated: true,
        status: OnboardingStatusEnum.COMPLETED,
        completedAt: expect.any(Date),
        currentStep: 'tutorial',
      });

      const result = await service.updateStep(
        userId,
        workspaceId,
        'firstProjectCreated',
        true,
      );

      expect(result.status).toBe(OnboardingStatusEnum.COMPLETED);
      expect(result.completedAt).toBeDefined();
    });

    it('should not overwrite completedAt if already set', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';
      const completedDate = new Date('2026-01-01');

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.COMPLETED,
        accountCreated: true,
        githubConnected: false,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: true,
        firstProjectCreated: true,
        tutorialCompleted: false,
        currentStep: 'tutorial',
        startedAt: new Date(),
        completedAt: completedDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockOnboarding);
      mockRepository.save.mockResolvedValue({
        ...mockOnboarding,
        tutorialCompleted: true,
      });

      const result = await service.updateStep(
        userId,
        workspaceId,
        'tutorialCompleted',
        true,
      );

      expect(result.completedAt).toEqual(completedDate);
    });

    it('should throw NotFoundException when onboarding status not found', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateStep(userId, workspaceId, 'aiKeyAdded', true),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Step ordering and auto-advance logic', () => {
    it('should advance to create_project when ai_key_added is completed', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        githubConnected: false,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: false,
        firstProjectCreated: false,
        tutorialCompleted: false,
        currentStep: 'service_connections',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockOnboarding);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateStep(
        userId,
        workspaceId,
        'aiKeyAdded',
        true,
      );

      expect(result.currentStep).toBe('create_project');
    });

    it('should advance to tutorial when first_project_created is completed', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        githubConnected: false,
        deploymentConfigured: false,
        databaseConfigured: false,
        aiKeyAdded: true,
        firstProjectCreated: false,
        tutorialCompleted: false,
        currentStep: 'create_project',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockOnboarding);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateStep(
        userId,
        workspaceId,
        'firstProjectCreated',
        true,
      );

      expect(result.currentStep).toBe('tutorial');
    });

    it('should recognize completion with minimum required steps (ignoring optional)', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const workspaceId = '123e4567-e89b-12d3-a456-426614174001';

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId,
        workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        accountCreated: true,
        githubConnected: false, // optional
        deploymentConfigured: false, // optional
        databaseConfigured: false, // optional
        aiKeyAdded: true,
        firstProjectCreated: false,
        tutorialCompleted: false, // optional
        currentStep: 'create_project',
        startedAt: new Date(),
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockOnboarding);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateStep(
        userId,
        workspaceId,
        'firstProjectCreated',
        true,
      );

      // Should be completed even though optional steps are not done
      expect(result.status).toBe(OnboardingStatusEnum.COMPLETED);
      expect(result.completedAt).toBeDefined();
    });
  });
});
