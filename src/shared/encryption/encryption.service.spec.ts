import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  const mockEncryptionKey = 'a'.repeat(64); // 64-character hex string

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ENCRYPTION_KEY') return mockEncryptionKey;
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
});
