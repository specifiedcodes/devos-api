import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from '../services/onboarding.service';
import { OnboardingStatusEnum } from '../../../database/entities/onboarding-status.entity';

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let service: OnboardingService;

  const mockOnboardingService = {
    getOnboardingStatus: jest.fn(),
    updateStep: jest.fn(),
  };

  const mockRequest = {
    user: {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      workspaceId: '123e4567-e89b-12d3-a456-426614174001',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        {
          provide: OnboardingService,
          useValue: mockOnboardingService,
        },
      ],
    }).compile();

    controller = module.get<OnboardingController>(OnboardingController);
    service = module.get<OnboardingService>(OnboardingService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return onboarding status for current user', async () => {
      const mockResponse = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId: mockRequest.user.userId,
        workspaceId: mockRequest.user.workspaceId,
        status: OnboardingStatusEnum.IN_PROGRESS,
        steps: {
          accountCreated: true,
          githubConnected: false,
          deploymentConfigured: false,
          databaseConfigured: false,
          aiKeyAdded: false,
          firstProjectCreated: false,
          tutorialCompleted: false,
        },
        currentStep: 'service_connections',
        nextStep: 'service_connections',
        completionPercentage: 14,
        isComplete: false,
        startedAt: new Date(),
        completedAt: null,
      };

      mockOnboardingService.getOnboardingStatus.mockResolvedValue(
        mockResponse,
      );

      const result = await controller.getStatus(mockRequest);

      expect(service.getOnboardingStatus).toHaveBeenCalledWith(
        mockRequest.user.userId,
        mockRequest.user.workspaceId,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateStep', () => {
    it('should update a valid step', async () => {
      const stepName = 'aiKeyAdded';
      const updateDto = { value: true };

      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId: mockRequest.user.userId,
        workspaceId: mockRequest.user.workspaceId,
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

      mockOnboardingService.updateStep.mockResolvedValue(mockOnboarding);

      const result = await controller.updateStep(
        mockRequest,
        stepName,
        updateDto,
      );

      expect(service.updateStep).toHaveBeenCalledWith(
        mockRequest.user.userId,
        mockRequest.user.workspaceId,
        stepName,
        updateDto.value,
      );
      expect(result.aiKeyAdded).toBe(true);
    });

    it('should reject invalid step name', async () => {
      const invalidStep = 'invalidStep';
      const updateDto = { value: true };

      await expect(
        controller.updateStep(mockRequest, invalidStep, updateDto),
      ).rejects.toThrow(BadRequestException);

      expect(service.updateStep).not.toHaveBeenCalled();
    });

    it('should not allow updating accountCreated (not in valid steps)', async () => {
      const stepName = 'accountCreated';
      const updateDto = { value: false };

      await expect(
        controller.updateStep(mockRequest, stepName, updateDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('skipOnboarding', () => {
    it('should mark required steps as complete and return DTO', async () => {
      const mockOnboarding = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        userId: mockRequest.user.userId,
        workspaceId: mockRequest.user.workspaceId,
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
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDto = {
        id: mockOnboarding.id,
        userId: mockOnboarding.userId,
        workspaceId: mockOnboarding.workspaceId,
        status: mockOnboarding.status,
        steps: {
          accountCreated: true,
          githubConnected: false,
          deploymentConfigured: false,
          databaseConfigured: false,
          aiKeyAdded: true,
          firstProjectCreated: true,
          tutorialCompleted: false,
        },
        currentStep: 'tutorial',
        nextStep: 'tutorial',
        completionPercentage: 57,
        isComplete: true,
        startedAt: mockOnboarding.startedAt,
        completedAt: mockOnboarding.completedAt,
      };

      mockOnboardingService.updateStep.mockResolvedValue(mockOnboarding);
      mockOnboardingService.getOnboardingStatus.mockResolvedValue(mockDto);

      const result = await controller.skipOnboarding(mockRequest);

      expect(service.updateStep).toHaveBeenCalledTimes(2);
      expect(service.updateStep).toHaveBeenCalledWith(
        mockRequest.user.userId,
        mockRequest.user.workspaceId,
        'aiKeyAdded',
        true,
      );
      expect(service.updateStep).toHaveBeenCalledWith(
        mockRequest.user.userId,
        mockRequest.user.workspaceId,
        'firstProjectCreated',
        true,
      );
      expect(service.getOnboardingStatus).toHaveBeenCalledWith(
        mockRequest.user.userId,
        mockRequest.user.workspaceId,
      );
      expect(result.status).toBe(OnboardingStatusEnum.COMPLETED);
      expect(result.completionPercentage).toBeDefined();
    });
  });
});
