import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  const mockEncryptionKey = 'a'.repeat(64); // 64-character hex string
  const mockHkdfSalt = 'b'.repeat(64); // 64-character hex string

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ENCRYPTION_KEY') return mockEncryptionKey;
              if (key === 'ENCRYPTION_HKDF_SALT') return mockHkdfSalt;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt', () => {
    it('should encrypt plaintext successfully', () => {
      const plaintext = 'Hello, World!';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(plaintext);
    });

    it('should generate unique ciphertexts for same plaintext', () => {
      const plaintext = 'Test data';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Different IVs
    });

    it('should return encrypted data in correct format (iv:authTag:ciphertext)', () => {
      const plaintext = 'Test';
      const encrypted = service.encrypt(plaintext);

      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);

      // IV should be 32 hex chars (16 bytes)
      expect(parts[0]).toHaveLength(32);
      // Auth tag should be 32 hex chars (16 bytes)
      expect(parts[1]).toHaveLength(32);
      // Ciphertext length varies based on plaintext
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*(){}[]|\\:";\'<>?,./~`';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'Hello 世界 🌍';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt', () => {
    it('should decrypt ciphertext correctly', () => {
      const plaintext = 'Secret message';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long plaintext', () => {
      const plaintext = 'a'.repeat(1000);
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error for invalid encrypted data format', () => {
      expect(() => service.decrypt('invalid')).toThrow('Failed to decrypt data');
    });

    it('should throw error for corrupted ciphertext', () => {
      const plaintext = 'Test';
      const encrypted = service.encrypt(plaintext);
      const corrupted = encrypted.replace(/.$/, 'X'); // Change last character

      expect(() => service.decrypt(corrupted)).toThrow('Failed to decrypt data');
    });

    it('should throw error for tampered data (invalid auth tag)', () => {
      const plaintext = 'Test';
      const encrypted = service.encrypt(plaintext);
      const parts = encrypted.split(':');

      // Tamper with ciphertext (should fail auth tag verification)
      parts[2] = parts[2].replace(/.$/, 'X');
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow('Failed to decrypt data');
    });

    it('should throw error for missing parts', () => {
      expect(() => service.decrypt('onlyonepart')).toThrow(
        'Failed to decrypt data',
      );
      expect(() => service.decrypt('two:parts')).toThrow(
        'Failed to decrypt data',
      );
    });
  });

  describe('hash', () => {
    it('should hash data using SHA-256', () => {
      const data = 'password123';
      const hash = service.hash(data);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64); // SHA-256 hex is 64 characters
    });

    it('should generate consistent hashes for same input', () => {
      const data = 'test data';
      const hash1 = service.hash(data);
      const hash2 = service.hash(data);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = service.hash('data1');
      const hash2 = service.hash('data2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = service.hash('');

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });

    it('should return lowercase hex string', () => {
      const hash = service.hash('Test');

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('initialization', () => {
    it('should throw error if ENCRYPTION_KEY not set', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => null),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow('ENCRYPTION_KEY must be 64 characters (32 bytes in hex)');
    });

    it('should throw error if ENCRYPTION_KEY is wrong length', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => 'tooshort'),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow('ENCRYPTION_KEY must be 64 characters (32 bytes in hex)');
    });
  });

  describe('AES-256-GCM authentication', () => {
    it('should use AES-256-GCM with authentication tag', () => {
      const plaintext = 'Authenticated encryption test';
      const encrypted = service.encrypt(plaintext);

      // Verify format includes auth tag
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);

      const authTag = parts[1];
      expect(authTag).toHaveLength(32); // 16 bytes in hex

      // Verify decryption validates auth tag
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should detect tampering via auth tag verification', () => {
      const plaintext = 'Tamper detection test';
      const encrypted = service.encrypt(plaintext);
      const parts = encrypted.split(':');

      // Tamper with IV (should fail decryption)
      const tamperedIv = parts[0].replace(/.$/, 'X');
      const tamperedData = `${tamperedIv}:${parts[1]}:${parts[2]}`;

      expect(() => service.decrypt(tamperedData)).toThrow();
    });
  });

  describe('Workspace-scoped encryption', () => {
    it('should encrypt with workspace-specific key', () => {
      const workspaceId = 'workspace-123';
      const plaintext = 'Workspace secret data';

      const result = service.encryptWithWorkspaceKey(workspaceId, plaintext);

      expect(result.encryptedData).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.iv).toHaveLength(32); // 16 bytes in hex
      expect(result.encryptedData.split(':')).toHaveLength(2); // authTag:ciphertext
    });

    it('should decrypt with workspace-specific key', () => {
      const workspaceId = 'workspace-456';
      const plaintext = 'Test data';

      const encrypted = service.encryptWithWorkspaceKey(workspaceId, plaintext);
      const decrypted = service.decryptWithWorkspaceKey(
        workspaceId,
        encrypted.encryptedData,
        encrypted.iv,
      );

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext with different workspaces', () => {
      const plaintext = 'Same data';

      const workspace1Result = service.encryptWithWorkspaceKey(
        'workspace-1',
        plaintext,
      );
      const workspace2Result = service.encryptWithWorkspaceKey(
        'workspace-2',
        plaintext,
      );

      // Different workspaces should produce different encrypted data
      expect(workspace1Result.encryptedData).not.toBe(
        workspace2Result.encryptedData,
      );
      expect(workspace1Result.iv).not.toBe(workspace2Result.iv);
    });

    it('should fail to decrypt with wrong workspace ID', () => {
      const plaintext = 'Workspace isolated data';

      const encrypted = service.encryptWithWorkspaceKey(
        'workspace-correct',
        plaintext,
      );

      // Try to decrypt with different workspace ID
      expect(() =>
        service.decryptWithWorkspaceKey(
          'workspace-wrong',
          encrypted.encryptedData,
          encrypted.iv,
        ),
      ).toThrow('Failed to decrypt workspace data');
    });

    it('should handle empty string encryption for workspace', () => {
      const workspaceId = 'workspace-789';
      const plaintext = '';

      const encrypted = service.encryptWithWorkspaceKey(workspaceId, plaintext);
      const decrypted = service.decryptWithWorkspaceKey(
        workspaceId,
        encrypted.encryptedData,
        encrypted.iv,
      );

      expect(decrypted).toBe(plaintext);
    });

    it('should handle very long API keys (100+ characters)', () => {
      const workspaceId = 'workspace-long';
      const longApiKey = 'sk-ant-api03-' + 'x'.repeat(150);

      const encrypted = service.encryptWithWorkspaceKey(
        workspaceId,
        longApiKey,
      );
      const decrypted = service.decryptWithWorkspaceKey(
        workspaceId,
        encrypted.encryptedData,
        encrypted.iv,
      );

      expect(decrypted).toBe(longApiKey);
      expect(decrypted.length).toBeGreaterThan(100);
    });

    it('should handle unicode and emoji in encrypted data', () => {
      const workspaceId = 'workspace-unicode';
      const plaintext = '🔐 Secure 世界 Data ñ';

      const encrypted = service.encryptWithWorkspaceKey(workspaceId, plaintext);
      const decrypted = service.decryptWithWorkspaceKey(
        workspaceId,
        encrypted.encryptedData,
        encrypted.iv,
      );

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different IV for each encryption', () => {
      const workspaceId = 'workspace-iv-test';
      const plaintext = 'Test IV randomness';

      const encrypted1 = service.encryptWithWorkspaceKey(
        workspaceId,
        plaintext,
      );
      const encrypted2 = service.encryptWithWorkspaceKey(
        workspaceId,
        plaintext,
      );

      // Different IVs should be generated
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);

      // But both should decrypt to same plaintext
      const decrypted1 = service.decryptWithWorkspaceKey(
        workspaceId,
        encrypted1.encryptedData,
        encrypted1.iv,
      );
      const decrypted2 = service.decryptWithWorkspaceKey(
        workspaceId,
        encrypted2.encryptedData,
        encrypted2.iv,
      );

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it('should detect tampered ciphertext in workspace encryption', () => {
      const workspaceId = 'workspace-tamper';
      const plaintext = 'Original data';

      const encrypted = service.encryptWithWorkspaceKey(workspaceId, plaintext);

      // Tamper with encrypted data
      const parts = encrypted.encryptedData.split(':');
      const tamperedCiphertext = parts[1].replace(/.$/, 'X');
      const tamperedData = `${parts[0]}:${tamperedCiphertext}`;

      // Should throw on decryption due to auth tag mismatch
      expect(() =>
        service.decryptWithWorkspaceKey(workspaceId, tamperedData, encrypted.iv),
      ).toThrow('Failed to decrypt workspace data');
    });
  });
});
