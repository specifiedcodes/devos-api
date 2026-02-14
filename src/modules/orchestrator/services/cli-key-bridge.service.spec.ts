/**
 * CLIKeyBridgeService Tests
 * Story 11.2: Claude Code CLI Container Setup
 *
 * TDD: Tests written first, then implementation.
 * Tests the bridge between BYOK key management and CLI session spawning.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CLIKeyBridgeService } from './cli-key-bridge.service';
import { BYOKKeyService } from '../../byok/services/byok-key.service';
import { KeyProvider } from '../../../database/entities/byok-key.entity';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      models: {
        list: jest.fn(),
      },
    })),
  };
});

describe('CLIKeyBridgeService', () => {
  let service: CLIKeyBridgeService;
  let mockGetActiveKeyForProvider: jest.Mock;

  const mockWorkspaceId = 'workspace-123';
  const mockDecryptedKey = 'sk-ant-api03-test-key-value-for-testing-purposes-only-1234567890abcdef';

  beforeEach(async () => {
    mockGetActiveKeyForProvider = jest.fn();

    const mockBYOKKeyService = {
      getActiveKeyForProvider: mockGetActiveKeyForProvider,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CLIKeyBridgeService,
        { provide: BYOKKeyService, useValue: mockBYOKKeyService },
      ],
    }).compile();

    service = module.get<CLIKeyBridgeService>(CLIKeyBridgeService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getAnthropicKey', () => {
    it('should return decrypted key from BYOK service', async () => {
      mockGetActiveKeyForProvider.mockResolvedValue(mockDecryptedKey);

      const result = await service.getAnthropicKey(mockWorkspaceId);

      expect(result).toBe(mockDecryptedKey);
      expect(mockGetActiveKeyForProvider).toHaveBeenCalledWith(
        mockWorkspaceId,
        KeyProvider.ANTHROPIC,
      );
    });

    it('should throw ForbiddenException when no Anthropic key exists', async () => {
      mockGetActiveKeyForProvider.mockResolvedValue(null);

      await expect(service.getAnthropicKey(mockWorkspaceId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getAnthropicKey(mockWorkspaceId)).rejects.toThrow(
        'No active Anthropic API key configured for this workspace',
      );
    });

    it('should call BYOKKeyService.getActiveKeyForProvider with correct params', async () => {
      mockGetActiveKeyForProvider.mockResolvedValue(mockDecryptedKey);

      await service.getAnthropicKey(mockWorkspaceId);

      expect(mockGetActiveKeyForProvider).toHaveBeenCalledTimes(1);
      expect(mockGetActiveKeyForProvider).toHaveBeenCalledWith(
        mockWorkspaceId,
        KeyProvider.ANTHROPIC,
      );
    });

    it('should never log the decrypted key value', async () => {
      mockGetActiveKeyForProvider.mockResolvedValue(mockDecryptedKey);
      const logSpy = jest.spyOn(service['logger'], 'log');
      const errorSpy = jest.spyOn(service['logger'], 'error');
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.getAnthropicKey(mockWorkspaceId);

      // Check that no log call contains the key value
      const allCalls = [
        ...logSpy.mock.calls,
        ...errorSpy.mock.calls,
        ...warnSpy.mock.calls,
      ];
      for (const callArgs of allCalls) {
        const logContent = JSON.stringify(callArgs);
        expect(logContent).not.toContain(mockDecryptedKey);
      }
    });
  });

  describe('verifyKeyValidity', () => {
    it('should return true for valid key', async () => {
      // Mock the Anthropic client to return success
      const mockList = jest.fn().mockResolvedValue({ data: [] });
      (service as any).createAnthropicClient = jest.fn().mockReturnValue({
        models: { list: mockList },
      });

      const result = await service.verifyKeyValidity(mockDecryptedKey);

      expect(result).toBe(true);
    });

    it('should return false for invalid/expired key', async () => {
      const mockList = jest.fn().mockRejectedValue(new Error('Authentication error'));
      (service as any).createAnthropicClient = jest.fn().mockReturnValue({
        models: { list: mockList },
      });

      const result = await service.verifyKeyValidity(mockDecryptedKey);

      expect(result).toBe(false);
    });

    it('should return false when API call fails', async () => {
      const mockList = jest.fn().mockRejectedValue(new Error('Network error'));
      (service as any).createAnthropicClient = jest.fn().mockReturnValue({
        models: { list: mockList },
      });

      const result = await service.verifyKeyValidity(mockDecryptedKey);

      expect(result).toBe(false);
    });

    it('should not throw on network errors', async () => {
      const mockList = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      (service as any).createAnthropicClient = jest.fn().mockReturnValue({
        models: { list: mockList },
      });

      // Should not throw, just return false
      await expect(service.verifyKeyValidity(mockDecryptedKey)).resolves.toBe(false);
    });
  });
});
