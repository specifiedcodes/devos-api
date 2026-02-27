/**
 * IntegrationManagementController Tests
 * Story 21-7: Integration Management UI (AC2)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { IntegrationManagementController } from '../services/integration-management.controller';
import {
  IntegrationManagementService,
  IntegrationType,
  IntegrationCategory,
  UnifiedIntegrationStatus,
} from '../services/integration-management.service';
import { IntegrationHealthService } from '../services/integration-health.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

function createMockStatus(type: IntegrationType, overrides: Partial<UnifiedIntegrationStatus> = {}): UnifiedIntegrationStatus {
  return {
    type,
    name: type.charAt(0).toUpperCase() + type.slice(1),
    description: `${type} integration`,
    category: IntegrationCategory.COMMUNICATION,
    connected: false,
    status: 'disconnected',
    configUrl: `integrations/${type}`,
    available: true,
    ...overrides,
  };
}

describe('IntegrationManagementController', () => {
  let controller: IntegrationManagementController;
  let service: jest.Mocked<IntegrationManagementService>;

  beforeEach(async () => {
    const mockService = {
      getAllIntegrationStatuses: jest.fn(),
      getIntegrationSummary: jest.fn(),
      getIntegrationStatus: jest.fn(),
      getRecentActivity: jest.fn(),
    };

    const mockHealthService = {
      getAllHealth: jest.fn(),
      getHealthSummary: jest.fn(),
      getHealth: jest.fn(),
      getHealthHistory: jest.fn(),
      forceHealthCheck: jest.fn(),
      retryFailed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationManagementController],
      providers: [
        { provide: IntegrationManagementService, useValue: mockService },
        { provide: IntegrationHealthService, useValue: mockHealthService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IntegrationManagementController>(IntegrationManagementController);
    service = module.get(IntegrationManagementService) as jest.Mocked<IntegrationManagementService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET management/all', () => {
    it('returns 200 with array of integration statuses', async () => {
      const statuses = [
        createMockStatus(IntegrationType.SLACK),
        createMockStatus(IntegrationType.DISCORD),
      ];
      service.getAllIntegrationStatuses.mockResolvedValue(statuses);

      const result = await controller.getAllStatuses(WORKSPACE_ID, {});
      expect(result).toEqual(statuses);
      expect(service.getAllIntegrationStatuses).toHaveBeenCalledWith(WORKSPACE_ID, undefined);
    });

    it('returns only communication integrations when category=communication', async () => {
      const statuses = [
        createMockStatus(IntegrationType.SLACK),
        createMockStatus(IntegrationType.DISCORD),
      ];
      service.getAllIntegrationStatuses.mockResolvedValue(statuses);

      const result = await controller.getAllStatuses(WORKSPACE_ID, {
        category: IntegrationCategory.COMMUNICATION,
      });
      expect(result).toEqual(statuses);
      expect(service.getAllIntegrationStatuses).toHaveBeenCalledWith(
        WORKSPACE_ID,
        IntegrationCategory.COMMUNICATION,
      );
    });
  });

  describe('GET management/summary', () => {
    it('returns 200 with correct counts', async () => {
      const summary = { total: 8, connected: 2, errored: 1, disconnected: 5 };
      service.getIntegrationSummary.mockResolvedValue(summary);

      const result = await controller.getSummary(WORKSPACE_ID);
      expect(result).toEqual(summary);
      expect(service.getIntegrationSummary).toHaveBeenCalledWith(WORKSPACE_ID);
    });
  });

  describe('GET management/:type', () => {
    it('returns 200 for valid type', async () => {
      const status = createMockStatus(IntegrationType.SLACK, { connected: true, status: 'active' });
      service.getIntegrationStatus.mockResolvedValue(status);

      const result = await controller.getStatus(WORKSPACE_ID, 'slack');
      expect(result).toEqual(status);
      expect(service.getIntegrationStatus).toHaveBeenCalledWith(WORKSPACE_ID, IntegrationType.SLACK);
    });

    it('returns 400 for invalid type', async () => {
      await expect(controller.getStatus(WORKSPACE_ID, 'invalid')).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET management/activity', () => {
    it('returns 200 with recent activity array', async () => {
      const activity = [
        { type: IntegrationType.SLACK, event: 'connected', timestamp: '2025-01-01T00:00:00Z' },
      ];
      service.getRecentActivity.mockResolvedValue(activity);

      const result = await controller.getRecentActivity(WORKSPACE_ID, {});
      expect(result).toEqual(activity);
      expect(service.getRecentActivity).toHaveBeenCalledWith(WORKSPACE_ID, undefined);
    });

    it('passes limit parameter correctly', async () => {
      service.getRecentActivity.mockResolvedValue([]);

      await controller.getRecentActivity(WORKSPACE_ID, { limit: 5 });
      expect(service.getRecentActivity).toHaveBeenCalledWith(WORKSPACE_ID, 5);
    });
  });
});
