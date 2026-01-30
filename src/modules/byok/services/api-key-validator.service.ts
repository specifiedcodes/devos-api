import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { KeyProvider } from '../../../database/entities/byok-key.entity';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

@Injectable()
export class ApiKeyValidatorService {
  private readonly logger = new Logger(ApiKeyValidatorService.name);
  private readonly validationTimeout: number;

  constructor(private readonly configService: ConfigService) {
    this.validationTimeout = this.configService.get<number>(
      'API_VALIDATION_TIMEOUT',
      5000,
    );
  }

  /**
   * Validate an API key by making a lightweight API call to the provider
   */
  async validateApiKey(
    provider: KeyProvider,
    apiKey: string,
  ): Promise<ValidationResult> {
    try {
      switch (provider) {
        case KeyProvider.ANTHROPIC:
          return await this.validateAnthropicKey(apiKey);
        case KeyProvider.OPENAI:
          return await this.validateOpenAIKey(apiKey);
        default:
          throw new Error('Unsupported provider');
      }
    } catch (error) {
      this.logger.error(
        `API key validation failed for provider ${provider}`,
        error,
      );
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Validate Anthropic API key by making a minimal API call
   */
  private async validateAnthropicKey(apiKey: string): Promise<ValidationResult> {
    try {
      const client = new Anthropic({
        apiKey,
        timeout: this.validationTimeout,
      });

      // Make a minimal API call to verify the key
      await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });

      return { isValid: true };
    } catch (error: any) {
      this.logger.warn(
        `Anthropic API key validation failed: ${error.message}`,
      );
      return {
        isValid: false,
        error: error.status === 401
          ? 'Invalid API key'
          : error.message || 'Validation failed',
      };
    }
  }

  /**
   * Validate OpenAI API key by making a minimal API call
   */
  private async validateOpenAIKey(apiKey: string): Promise<ValidationResult> {
    try {
      const client = new OpenAI({
        apiKey,
        timeout: this.validationTimeout,
      });

      // Make a minimal API call to verify the key (list models is lightweight)
      await client.models.list();

      return { isValid: true };
    } catch (error: any) {
      this.logger.warn(`OpenAI API key validation failed: ${error.message}`);
      return {
        isValid: false,
        error: error.status === 401
          ? 'Invalid API key'
          : error.message || 'Validation failed',
      };
    }
  }
}
