import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 16; // 128 bits for GCM
  private readonly encryptionKey: Buffer;
  private readonly hkdfSalt: Buffer;

  constructor(private configService: ConfigService) {
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!key || key.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be 64 characters (32 bytes in hex). Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    this.encryptionKey = Buffer.from(key, 'hex');

    // Load HKDF salt from environment or use a secure default
    const saltHex = this.configService.get<string>('ENCRYPTION_HKDF_SALT');
    if (saltHex && saltHex.length === 64) {
      this.hkdfSalt = Buffer.from(saltHex, 'hex');
    } else {
      this.logger.warn(
        'ENCRYPTION_HKDF_SALT not configured. Using default salt. For production, set ENCRYPTION_HKDF_SALT to a 64-character hex string.',
      );
      this.hkdfSalt = Buffer.from('devos-workspace-byok-salt');
    }
  }

  /**
   * Encrypts plaintext using AES-256-GCM
   * @param plaintext - Text to encrypt
   * @returns Encrypted text in format: iv:authTag:ciphertext (all hex-encoded)
   */
  encrypt(plaintext: string): string {
    try {
      // Generate random initialization vector
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(
        this.algorithm,
        this.encryptionKey,
        iv,
      );

      // Encrypt
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');

      // Get authentication tag (GCM mode)
      const authTag = cipher.getAuthTag();

      // Return format: iv:authTag:ciphertext
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
    } catch (error) {
      this.logger.error('Encryption failed', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts ciphertext using AES-256-GCM
   * @param encryptedData - Encrypted text in format: iv:authTag:ciphertext
   * @returns Decrypted plaintext
   */
  decrypt(encryptedData: string): string {
    try {
      // Parse encrypted data
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const ciphertext = parts[2];

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        iv,
      );
      decipher.setAuthTag(authTag);

      // Decrypt
      let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    } catch (error) {
      this.logger.error('Decryption failed', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hashes data using SHA-256
   * @param data - Data to hash
   * @returns Hex-encoded hash
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Derives a workspace-specific encryption key from the master key
   * @param workspaceId - Workspace ID to derive key for
   * @returns Workspace-specific encryption key
   */
  private deriveWorkspaceKey(workspaceId: string): Buffer {
    // Use HKDF (HMAC-based Key Derivation Function) to derive workspace key
    const info = Buffer.from(`workspace:${workspaceId}`);

    return crypto.hkdfSync(
      'sha256',
      this.encryptionKey,
      this.hkdfSalt,
      info,
      32, // 32 bytes for AES-256
    );
  }

  /**
   * Encrypts plaintext using workspace-scoped AES-256-GCM
   * @param workspaceId - Workspace ID for key derivation
   * @param plaintext - Text to encrypt
   * @returns Object with encrypted data and IV
   */
  encryptWithWorkspaceKey(
    workspaceId: string,
    plaintext: string,
  ): { encryptedData: string; iv: string } {
    try {
      // Derive workspace-specific key
      const workspaceKey = this.deriveWorkspaceKey(workspaceId);

      // Generate random initialization vector
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, workspaceKey, iv);

      // Encrypt
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');

      // Get authentication tag (GCM mode)
      const authTag = cipher.getAuthTag();

      // Return format: authTag:ciphertext
      return {
        encryptedData: `${authTag.toString('hex')}:${ciphertext}`,
        iv: iv.toString('hex'),
      };
    } catch (error) {
      this.logger.error('Workspace encryption failed', error);
      throw new Error('Failed to encrypt workspace data');
    }
  }

  /**
   * Decrypts ciphertext using workspace-scoped AES-256-GCM
   * @param workspaceId - Workspace ID for key derivation
   * @param encryptedData - Encrypted text in format: authTag:ciphertext
   * @param ivHex - Initialization vector (hex-encoded)
   * @returns Decrypted plaintext
   */
  decryptWithWorkspaceKey(
    workspaceId: string,
    encryptedData: string,
    ivHex: string,
  ): string {
    try {
      // Derive workspace-specific key
      const workspaceKey = this.deriveWorkspaceKey(workspaceId);

      // Parse encrypted data
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const authTag = Buffer.from(parts[0], 'hex');
      const ciphertext = parts[1];
      const iv = Buffer.from(ivHex, 'hex');

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        workspaceKey,
        iv,
      );
      decipher.setAuthTag(authTag);

      // Decrypt
      let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    } catch (error) {
      this.logger.error('Workspace decryption failed', error);
      throw new Error('Failed to decrypt workspace data');
    }
  }
}
