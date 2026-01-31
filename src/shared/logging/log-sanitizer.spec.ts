import { sanitizeLogData, sanitizeForAudit } from './log-sanitizer';

describe('Log Sanitizer', () => {
  describe('sanitizeLogData', () => {
    describe('Anthropic API keys', () => {
      it('should redact Anthropic API keys (sk-ant-)', () => {
        const input = 'Using API key: sk-ant-api03-abc123def456ghi789';
        const output = sanitizeLogData(input);

        expect(output).toBe('Using API key: sk-ant-[REDACTED]');
        expect(output).not.toContain('abc123');
      });

      it('should redact multiple Anthropic keys in same string', () => {
        const input =
          'Keys: sk-ant-api03-key1abc and sk-ant-api03-key2def';
        const output = sanitizeLogData(input);

        expect(output).toBe('Keys: sk-ant-[REDACTED] and sk-ant-[REDACTED]');
        expect(output).not.toContain('key1abc');
        expect(output).not.toContain('key2def');
      });

      it('should handle Anthropic keys with various characters', () => {
        const input = 'Key: sk-ant-api03-ABC_123-xyz_';
        const output = sanitizeLogData(input);

        expect(output).toBe('Key: sk-ant-[REDACTED]');
      });
    });

    describe('OpenAI API keys', () => {
      it('should redact OpenAI project keys (sk-proj-)', () => {
        const input = 'OpenAI key: sk-proj-abc123def456ghi789';
        const output = sanitizeLogData(input);

        expect(output).toBe('OpenAI key: sk-proj-[REDACTED]');
        expect(output).not.toContain('abc123');
      });

      it('should redact legacy OpenAI keys (sk-)', () => {
        const input = 'Legacy key: sk-abc123def456';
        const output = sanitizeLogData(input);

        expect(output).toBe('Legacy key: sk-[REDACTED]');
      });

      it('should not redact sk-ant- when redacting generic sk- keys', () => {
        const input = 'Keys: sk-ant-api03-test123 and sk-legacy456';
        const output = sanitizeLogData(input);

        // sk-ant- should be redacted first, then sk-
        expect(output).toBe('Keys: sk-ant-[REDACTED] and sk-[REDACTED]');
      });
    });

    describe('Generic API key patterns', () => {
      it('should redact api_key= patterns', () => {
        const input = 'Config: api_key=secret123456';
        const output = sanitizeLogData(input);

        expect(output).toBe('Config: api_key=[REDACTED]');
        expect(output).not.toContain('secret123');
      });

      it('should redact api-key= patterns', () => {
        const input = 'Header: api-key=secret789xyz';
        const output = sanitizeLogData(input);

        expect(output).toBe('Header: api-key=[REDACTED]');
      });

      it('should redact apiKey: patterns', () => {
        const input = 'JSON: {"apiKey": "abc123"}';
        const output = sanitizeLogData(input);

        expect(output).toContain('apiKey');
        expect(output).toContain('[REDACTED]');
        expect(output).not.toContain('abc123');
      });
    });

    describe('Object sanitization', () => {
      it('should recursively sanitize nested objects', () => {
        const input = {
          user: 'john',
          apiKey: 'sk-ant-api03-secret123',
          config: {
            key: 'sk-proj-nested456',
          },
        };

        const output = sanitizeLogData(input);

        expect(output.user).toBe('john');
        expect(output.apiKey).toBe('sk-ant-[REDACTED]');
        expect(output.config.key).toBe('sk-proj-[REDACTED]');
      });

      it('should sanitize array elements', () => {
        const input = {
          keys: ['sk-ant-api03-key1', 'sk-proj-key2', 'safe-value'],
        };

        const output = sanitizeLogData(input);

        expect(output.keys[0]).toBe('sk-ant-[REDACTED]');
        expect(output.keys[1]).toBe('sk-proj-[REDACTED]');
        expect(output.keys[2]).toBe('safe-value');
      });

      it('should handle null and undefined values', () => {
        const input = {
          key1: null,
          key2: undefined,
          key3: 'sk-ant-api03-test',
        };

        const output = sanitizeLogData(input);

        expect(output.key1).toBeNull();
        expect(output.key2).toBeUndefined();
        expect(output.key3).toBe('sk-ant-[REDACTED]');
      });
    });

    describe('Edge cases', () => {
      it('should handle empty string', () => {
        expect(sanitizeLogData('')).toBe('');
      });

      it('should handle string with no secrets', () => {
        const input = 'This is a safe log message';
        expect(sanitizeLogData(input)).toBe(input);
      });

      it('should handle very long keys', () => {
        const longKey = 'sk-ant-api03-' + 'a'.repeat(200);
        const input = `Key: ${longKey}`;
        const output = sanitizeLogData(input);

        expect(output).toBe('Key: sk-ant-[REDACTED]');
        expect(output).not.toContain('aaaa');
      });

      it('should handle keys at string boundaries', () => {
        const input = 'sk-ant-api03-start123';
        const output = sanitizeLogData(input);

        expect(output).toBe('sk-ant-[REDACTED]');
      });

      it('should preserve non-key data', () => {
        const input = 'User: john, Key: sk-ant-api03-test, Role: admin';
        const output = sanitizeLogData(input);

        expect(output).toContain('User: john');
        expect(output).toContain('Role: admin');
        expect(output).toContain('sk-ant-[REDACTED]');
        expect(output).not.toContain('test');
      });
    });

    describe('Error objects', () => {
      it('should sanitize error messages', () => {
        const error = new Error(
          'API call failed with key: sk-ant-api03-error123',
        );
        const output = sanitizeLogData(error);

        expect(output.message).toContain('sk-ant-[REDACTED]');
        expect(output.message).not.toContain('error123');
      });

      it('should sanitize error stack traces', () => {
        const error = new Error('Failed');
        error.stack = `Error: Failed with sk-ant-api03-stack123\n    at test.js:10`;

        const output = sanitizeLogData(error);

        expect(output.stack).toContain('sk-ant-[REDACTED]');
        expect(output.stack).not.toContain('stack123');
        expect(output.stack).toContain('at test.js:10');
      });
    });
  });

  describe('sanitizeForAudit', () => {
    it('should return key ID for audit logging', () => {
      const keyId = 'key-uuid-123';
      const output = sanitizeForAudit(keyId);

      expect(output).toEqual({ keyId: 'key-uuid-123' });
    });

    it('should never include plaintext in audit metadata', () => {
      const metadata = {
        keyId: 'key-123',
        apiKey: 'sk-ant-api03-secret',
        action: 'create',
      };

      const output = sanitizeForAudit(metadata);

      expect(output.keyId).toBe('key-123');
      expect(output.action).toBe('create');
      expect(output.apiKey).toBeUndefined();
    });

    it('should strip sensitive fields from audit metadata', () => {
      const metadata = {
        keyId: 'key-123',
        keyName: 'My Key',
        plaintextKey: 'sk-ant-secret',
        decryptedKey: 'sk-proj-secret',
        encrypted_key: 'encrypted-data',
      };

      const output = sanitizeForAudit(metadata);

      expect(output.keyId).toBe('key-123');
      expect(output.keyName).toBe('My Key');
      expect(output.plaintextKey).toBeUndefined();
      expect(output.decryptedKey).toBeUndefined();
      expect(output.encrypted_key).toBeUndefined();
    });

    it('should redact API key patterns embedded in non-sensitive string field values', () => {
      const metadata = {
        error: 'Failed with key sk-ant-api03-secret-value-12345678901234567890',
        provider: 'anthropic',
        keyId: 'key-123',
      };

      const output = sanitizeForAudit(metadata);

      expect(output.error).toContain('sk-ant-[REDACTED]');
      expect(output.error).not.toContain('secret-value');
      expect(output.provider).toBe('anthropic');
      expect(output.keyId).toBe('key-123');
    });
  });
});
