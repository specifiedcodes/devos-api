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
   *
   * This method performs live validation by making a minimal API call to the provider's
   * service. It verifies that the key is valid, has not been revoked, and has available quota.
   *
   * @param provider - The API key provider (Anthropic or OpenAI)
   * @param apiKey - The API key to validate
   * @returns ValidationResult containing isValid boolean and optional error message
   * @throws Never throws - all errors are caught and returned in ValidationResult
   *
   * @example
   * const result = await validator.validateApiKey(KeyProvider.ANTHROPIC, 'sk-ant-...');
   * if (!result.isValid) {
   *   console.error(result.error); // "Invalid Anthropic API key"
   * }
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

      // Provide specific error messages based on error type
      let errorMessage = 'Validation failed';

      if (error.status === 401) {
        errorMessage = 'Invalid Anthropic API key';
      } else if (error.status === 429) {
        errorMessage = 'API key has no remaining quota or rate limit exceeded';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        errorMessage = 'Unable to reach Anthropic servers. Check your network connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        isValid: false,
        error: errorMessage,
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

      // Make a minimal chat completion call to verify the key (2-token prompt)
      await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });

      return { isValid: true };
    } catch (error: any) {
      this.logger.warn(`OpenAI API key validation failed: ${error.message}`);

      // Provide specific error messages based on error type
      let errorMessage = 'Validation failed';

      if (error.status === 401) {
        errorMessage = 'Invalid OpenAI API key';
      } else if (error.status === 429) {
        errorMessage = 'API key has no remaining quota or rate limit exceeded';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        errorMessage = 'Unable to reach OpenAI servers. Check your network connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        isValid: false,
        error: errorMessage,
      };
    }
  }
}
