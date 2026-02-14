/**
 * CLIKeyBridgeService
 * Story 11.2: Claude Code CLI Container Setup
 *
 * Bridges BYOK key management with CLI session spawning.
 * Keys are decrypted only at session spawn time and passed via
 * environment variable - never written to disk or logs.
 */
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { BYOKKeyService } from '../../byok/services/byok-key.service';
import { KeyProvider } from '../../../database/entities/byok-key.entity';
import Anthropic from '@anthropic-ai/sdk';

@Injectable()
export class CLIKeyBridgeService {
  private readonly logger = new Logger(CLIKeyBridgeService.name);

  constructor(private readonly byokKeyService: BYOKKeyService) {}

  /**
   * Decrypt and return the Anthropic API key for a workspace.
   * Uses BYOKKeyService.getActiveKeyForProvider() under the hood.
   *
   * @throws ForbiddenException if no active Anthropic key exists
   * @throws ForbiddenException if key decryption fails
   */
  async getAnthropicKey(workspaceId: string): Promise<string> {
    this.logger.log(
      `Retrieving Anthropic API key for workspace ${workspaceId}`,
    );

    const decryptedKey = await this.byokKeyService.getActiveKeyForProvider(
      workspaceId,
      KeyProvider.ANTHROPIC,
    );

    if (!decryptedKey) {
      throw new ForbiddenException(
        'No active Anthropic API key configured for this workspace',
      );
    }

    // Log successful retrieval without exposing key value
    this.logger.log(
      `Anthropic API key retrieved for workspace ${workspaceId}`,
    );

    return decryptedKey;
  }

  /**
   * Verify the decrypted key is still valid by making a lightweight API call.
   * Uses the models.list endpoint to verify key without spending tokens.
   * Returns false if key is expired, revoked, or invalid.
   *
   * Never throws - always returns boolean.
   */
  async verifyKeyValidity(apiKey: string): Promise<boolean> {
    try {
      const client = this.createAnthropicClient(apiKey);
      await client.models.list();
      return true;
    } catch {
      this.logger.warn('API key validation failed - key may be invalid or expired');
      return false;
    }
  }

  /**
   * Create an Anthropic client instance for key verification.
   * Separated for testability.
   */
  protected createAnthropicClient(apiKey: string): Anthropic {
    return new Anthropic({ apiKey });
  }
}
