/**
 * MarketplaceEventsGateway Tests
 *
 * Story 18-8: Agent Installation Flow
 */
import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceEventsGateway } from '../marketplace-events.gateway';
import { InstallationStatus } from '../../../database/entities/installation-log.entity';
import { Socket } from 'socket.io';

describe('MarketplaceEventsGateway', () => {
  let gateway: MarketplaceEventsGateway;

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  const createMockSocket = (overrides = {}): Socket => {
    return {
      id: 'socket-1',
      handshake: {
        query: {},
        user: { id: 'user-1' },
      } as any,
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      ...overrides,
    } as unknown as Socket;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketplaceEventsGateway],
    }).compile();

    gateway = module.get<MarketplaceEventsGateway>(MarketplaceEventsGateway);
    gateway.server = mockServer as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should disconnect unauthenticated clients', () => {
      const mockSocket = createMockSocket({
        handshake: { query: {}, user: null } as any,
      });
      const disconnectSpy = jest.spyOn(mockSocket, 'disconnect');

      gateway.handleConnection(mockSocket);

      expect(disconnectSpy).toHaveBeenCalledWith(true);
    });

    it('should join workspace room when workspaceId provided', () => {
      const mockSocket = createMockSocket({
        handshake: {
          query: { workspaceId: 'workspace-1' },
          user: { id: 'user-1' },
        } as any,
      });
      const joinSpy = jest.spyOn(mockSocket, 'join');

      gateway.handleConnection(mockSocket);

      expect(joinSpy).toHaveBeenCalledWith('workspace:workspace-1');
    });

    it('should not join room when workspaceId not provided', () => {
      const mockSocket = createMockSocket({
        handshake: {
          query: {},
          user: { id: 'user-1' },
        } as any,
      });
      const joinSpy = jest.spyOn(mockSocket, 'join');

      gateway.handleConnection(mockSocket);

      expect(joinSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleSubscribeInstallation', () => {
    it('should join installation room', async () => {
      const mockSocket = createMockSocket();
      const joinSpy = jest.spyOn(mockSocket, 'join');

      const result = await gateway.handleSubscribeInstallation(mockSocket, {
        installationId: 'install-1',
      });

      expect(joinSpy).toHaveBeenCalledWith('installation:install-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('handleUnsubscribeInstallation', () => {
    it('should leave installation room', async () => {
      const mockSocket = createMockSocket();
      const leaveSpy = jest.spyOn(mockSocket, 'leave');

      const result = await gateway.handleUnsubscribeInstallation(mockSocket, {
        installationId: 'install-1',
      });

      expect(leaveSpy).toHaveBeenCalledWith('installation:install-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('emitProgress', () => {
    it('should emit progress event to installation and workspace rooms', () => {
      const event = {
        installationId: 'install-1',
        marketplaceAgentId: 'agent-1',
        agentName: 'Test Agent',
        status: InstallationStatus.INSTALLING,
        currentStep: 'copy_definition',
        progressPercentage: 50,
        timestamp: new Date(),
      };

      gateway.emitProgress(event, 'workspace-1');

      expect(mockServer.to).toHaveBeenCalledWith('installation:install-1');
      expect(mockServer.to).toHaveBeenCalledWith('workspace:workspace-1');
      expect(mockServer.emit).toHaveBeenCalledWith('installation:progress', event);
    });
  });

  describe('emitComplete', () => {
    it('should emit complete event', () => {
      const event = {
        installationId: 'install-1',
        marketplaceAgentId: 'agent-1',
        agentName: 'Test Agent',
        status: InstallationStatus.COMPLETED,
        currentStep: 'complete',
        progressPercentage: 100,
        timestamp: new Date(),
      };

      gateway.emitComplete(event, 'workspace-1');

      expect(mockServer.emit).toHaveBeenCalledWith('installation:complete', event);
    });
  });

  describe('emitError', () => {
    it('should emit error event', () => {
      const event = {
        installationId: 'install-1',
        marketplaceAgentId: 'agent-1',
        agentName: 'Test Agent',
        status: InstallationStatus.FAILED,
        currentStep: 'copy_definition',
        progressPercentage: 50,
        error: 'Something went wrong',
        timestamp: new Date(),
      };

      gateway.emitError(event, 'workspace-1');

      expect(mockServer.emit).toHaveBeenCalledWith('installation:error', event);
    });
  });

  describe('emitCancelled', () => {
    it('should emit cancelled event', () => {
      const event = {
        installationId: 'install-1',
        marketplaceAgentId: 'agent-1',
        agentName: 'Test Agent',
        status: InstallationStatus.ROLLED_BACK,
        currentStep: 'check_dependencies',
        progressPercentage: 25,
        message: 'Installation cancelled',
        timestamp: new Date(),
      };

      gateway.emitCancelled(event, 'workspace-1');

      expect(mockServer.emit).toHaveBeenCalledWith('installation:cancelled', event);
    });
  });

  describe('emitRollback', () => {
    it('should emit rollback event', () => {
      const event = {
        installationId: 'install-1',
        marketplaceAgentId: 'agent-1',
        agentName: 'Test Agent',
        status: InstallationStatus.ROLLED_BACK,
        currentStep: '',
        progressPercentage: 0,
        message: 'Installation rolled back',
        timestamp: new Date(),
      };

      gateway.emitRollback(event, 'workspace-1');

      expect(mockServer.emit).toHaveBeenCalledWith('installation:rollback', event);
    });
  });
});
