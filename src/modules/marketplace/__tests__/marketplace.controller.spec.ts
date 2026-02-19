/**
 * MarketplaceController Unit Tests
 *
 * Story 18-5: Agent Marketplace Backend
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceController } from '../marketplace.controller';
import { MarketplaceService } from '../marketplace.service';
import { SuperAdminGuard } from '../../admin/guards/super-admin.guard';
import {
  MarketplaceAgentStatus,
  MarketplaceAgentCategory,
  MarketplacePricingType,
} from '../../../database/entities/marketplace-agent.entity';

describe('MarketplaceController', () => {
  let controller: MarketplaceController;
  let service: jest.Mocked<MarketplaceService>;

  const mockUser = { id: 'user-uuid', userId: 'user-uuid' };
  const mockRequest = { user: mockUser };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketplaceController],
      providers: [
        {
          provide: MarketplaceService,
          useValue: {
            browseAgents: jest.fn(),
            searchAgents: jest.fn(),
            listCategories: jest.fn(),
            getFeaturedAgents: jest.fn(),
            listInstalledAgents: jest.fn(),
            checkForUpdates: jest.fn(),
            publishAgent: jest.fn(),
            getAgentDetails: jest.fn(),
            updateListing: jest.fn(),
            unpublishAgent: jest.fn(),
            publishNewVersion: jest.fn(),
            installAgent: jest.fn(),
            uninstallAgent: jest.fn(),
            updateInstalledAgent: jest.fn(),
            submitReview: jest.fn(),
            getReviews: jest.fn(),
            approveListing: jest.fn(),
            suspendListing: jest.fn(),
            setFeatured: jest.fn(),
            verifyPublisher: jest.fn(),
            // Story 18-8 methods
            getAgentVersions: jest.fn(),
            installAgentVersion: jest.fn(),
            preInstallCheck: jest.fn(),
            getInstallationStatus: jest.fn(),
            cancelInstallation: jest.fn(),
            rollbackInstallation: jest.fn(),
            getInstallationHistory: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MarketplaceController>(MarketplaceController);
    service = module.get(MarketplaceService);
  });

  describe('browseAgents', () => {
    it('should call service.browseAgents with query params', async () => {
      const query = { page: 1, limit: 20, category: MarketplaceAgentCategory.DEVELOPMENT };
      const expectedResult = { items: [], total: 0, page: 1, limit: 20 };
      service.browseAgents.mockResolvedValue(expectedResult as any);

      const result = await controller.browseAgents(query);

      expect(service.browseAgents).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('searchAgents', () => {
    it('should call service.searchAgents with query params', async () => {
      const query = { q: 'test agent', page: 1, limit: 20 };
      const expectedResult = { items: [], total: 0, page: 1, limit: 20 };
      service.searchAgents.mockResolvedValue(expectedResult as any);

      const result = await controller.searchAgents(query);

      expect(service.searchAgents).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('listCategories', () => {
    it('should return categories with counts', async () => {
      const expectedResult = [
        { category: MarketplaceAgentCategory.DEVELOPMENT, count: 10 },
        { category: MarketplaceAgentCategory.QA, count: 5 },
      ];
      service.listCategories.mockResolvedValue(expectedResult);

      const result = await controller.listCategories();

      expect(service.listCategories).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getFeaturedAgents', () => {
    it('should return featured agents with default limit', async () => {
      const expectedResult = [{ id: 'agent-1', name: 'Featured Agent' }];
      service.getFeaturedAgents.mockResolvedValue(expectedResult as any);

      const result = await controller.getFeaturedAgents();

      expect(service.getFeaturedAgents).toHaveBeenCalledWith(10);
      expect(result).toEqual(expectedResult);
    });

    it('should return featured agents with custom limit', async () => {
      const expectedResult = [{ id: 'agent-1', name: 'Featured Agent' }];
      service.getFeaturedAgents.mockResolvedValue(expectedResult as any);

      const result = await controller.getFeaturedAgents(5);

      expect(service.getFeaturedAgents).toHaveBeenCalledWith(5);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('listInstalledAgents', () => {
    it('should call service.listInstalledAgents with correct params', async () => {
      const workspaceId = 'workspace-uuid';
      const query = { page: 1, limit: 20 };
      const expectedResult = { items: [], total: 0, page: 1, limit: 20 };
      service.listInstalledAgents.mockResolvedValue(expectedResult as any);

      const result = await controller.listInstalledAgents(workspaceId, query, mockRequest);

      expect(service.listInstalledAgents).toHaveBeenCalledWith(workspaceId, query, mockUser.id);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('checkForUpdates', () => {
    it('should call service.checkForUpdates with correct params', async () => {
      const dto = { workspaceId: 'workspace-uuid' };
      const expectedResult = [];
      service.checkForUpdates.mockResolvedValue(expectedResult);

      const result = await controller.checkForUpdates(dto, mockRequest);

      expect(service.checkForUpdates).toHaveBeenCalledWith(dto.workspaceId, mockUser.id);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('publishAgent', () => {
    it('should call service.publishAgent with correct params', async () => {
      const dto = {
        agentDefinitionId: 'definition-uuid',
        workspaceId: 'workspace-uuid',
        name: 'test-agent',
        displayName: 'Test Agent',
        shortDescription: 'Test description',
        longDescription: 'Long description',
        category: MarketplaceAgentCategory.DEVELOPMENT,
        pricingType: MarketplacePricingType.FREE,
      };
      const expectedResult = { id: 'agent-id', ...dto, status: MarketplaceAgentStatus.PUBLISHED };
      service.publishAgent.mockResolvedValue(expectedResult as any);

      const result = await controller.publishAgent(dto, mockRequest);

      expect(service.publishAgent).toHaveBeenCalledWith(
        dto.workspaceId,
        dto.agentDefinitionId,
        dto,
        mockUser.id,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getAgentDetails', () => {
    it('should call service.getAgentDetails with id', async () => {
      const agentId = 'agent-uuid';
      const expectedResult = {
        id: agentId,
        name: 'test-agent',
        status: MarketplaceAgentStatus.PUBLISHED,
      };
      service.getAgentDetails.mockResolvedValue(expectedResult as any);

      const result = await controller.getAgentDetails(agentId);

      expect(service.getAgentDetails).toHaveBeenCalledWith(agentId);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('updateListing', () => {
    it('should call service.updateListing with correct params', async () => {
      const agentId = 'agent-uuid';
      const dto = { displayName: 'Updated Name' };
      const expectedResult = { id: agentId, displayName: 'Updated Name' };
      service.updateListing.mockResolvedValue(expectedResult as any);

      const result = await controller.updateListing(agentId, dto, mockRequest);

      expect(service.updateListing).toHaveBeenCalledWith(agentId, dto, mockUser.id);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('unpublishAgent', () => {
    it('should call service.unpublishAgent with correct params', async () => {
      const agentId = 'agent-uuid';
      service.unpublishAgent.mockResolvedValue(undefined);

      await controller.unpublishAgent(agentId, mockRequest);

      expect(service.unpublishAgent).toHaveBeenCalledWith(agentId, mockUser.id);
    });
  });

  describe('installAgent', () => {
    it('should call service.installAgent with correct params', async () => {
      const agentId = 'agent-uuid';
      const dto = { workspaceId: 'workspace-uuid', autoUpdate: true };
      const expectedResult = { id: 'installed-id', marketplaceAgentId: agentId };
      service.installAgent.mockResolvedValue(expectedResult as any);

      const result = await controller.installAgent(agentId, dto, mockRequest);

      expect(service.installAgent).toHaveBeenCalledWith(agentId, dto, mockUser.id);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('uninstallAgent', () => {
    it('should call service.uninstallAgent with correct params', async () => {
      const agentId = 'agent-uuid';
      const dto = { workspaceId: 'workspace-uuid' };
      service.uninstallAgent.mockResolvedValue(undefined);

      await controller.uninstallAgent(agentId, dto, mockRequest);

      expect(service.uninstallAgent).toHaveBeenCalledWith(agentId, dto.workspaceId, mockUser.id);
    });
  });

  describe('submitReview', () => {
    it('should call service.submitReview with correct params', async () => {
      const agentId = 'agent-uuid';
      const dto = { workspaceId: 'workspace-uuid', rating: 5, review: 'Great!' };
      const expectedResult = { id: 'review-id', rating: 5 };
      service.submitReview.mockResolvedValue(expectedResult as any);

      const result = await controller.submitReview(agentId, dto, mockRequest);

      expect(service.submitReview).toHaveBeenCalledWith(
        agentId,
        dto.workspaceId,
        dto,
        mockUser.id,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getReviews', () => {
    it('should call service.getReviews with correct params', async () => {
      const agentId = 'agent-uuid';
      const query = { page: 1, limit: 10 };
      const expectedResult = { items: [], total: 0, page: 1, limit: 10 };
      service.getReviews.mockResolvedValue(expectedResult as any);

      const result = await controller.getReviews(agentId, query, mockRequest);

      expect(service.getReviews).toHaveBeenCalledWith(agentId, query, mockUser.id);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('approveListing', () => {
    it('should call service.approveListing with correct params', async () => {
      const agentId = 'agent-uuid';
      const expectedResult = { id: agentId, status: MarketplaceAgentStatus.PUBLISHED };
      service.approveListing.mockResolvedValue(expectedResult as any);

      const result = await controller.approveListing(agentId, mockRequest);

      expect(service.approveListing).toHaveBeenCalledWith(agentId, mockUser.id);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('suspendListing', () => {
    it('should call service.suspendListing with correct params', async () => {
      const agentId = 'agent-uuid';
      const reason = 'Policy violation';
      service.suspendListing.mockResolvedValue(undefined);

      await controller.suspendListing(agentId, reason, mockRequest);

      expect(service.suspendListing).toHaveBeenCalledWith(agentId, reason, mockUser.id);
    });
  });

  describe('setFeatured', () => {
    it('should call service.setFeatured with correct params', async () => {
      const agentId = 'agent-uuid';
      service.setFeatured.mockResolvedValue(undefined);

      await controller.setFeatured(agentId, true, mockRequest);

      expect(service.setFeatured).toHaveBeenCalledWith(agentId, true, mockUser.id);
    });
  });

  describe('verifyPublisher', () => {
    it('should call service.verifyPublisher with correct params', async () => {
      const agentId = 'agent-uuid';
      service.verifyPublisher.mockResolvedValue(undefined);

      await controller.verifyPublisher(agentId, mockRequest);

      expect(service.verifyPublisher).toHaveBeenCalledWith(agentId, mockUser.id);
    });
  });
});
