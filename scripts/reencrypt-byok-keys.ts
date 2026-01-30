#!/usr/bin/env ts-node
/**
 * BYOK Key Rotation Script
 *
 * This script re-encrypts all BYOK keys with a new master encryption key.
 * Use this when rotating the ENCRYPTION_KEY for security compliance.
 *
 * CRITICAL: This script requires BOTH old and new encryption keys
 *
 * Usage:
 *   OLD_ENCRYPTION_KEY=<old_key> \
 *   OLD_ENCRYPTION_HKDF_SALT=<old_salt> \
 *   NEW_ENCRYPTION_KEY=<new_key> \
 *   NEW_ENCRYPTION_HKDF_SALT=<new_salt> \
 *   ts-node scripts/reencrypt-byok-keys.ts
 *
 * Prerequisites:
 * 1. Backup database before running
 * 2. Set OLD_ENCRYPTION_KEY and OLD_ENCRYPTION_HKDF_SALT (current values)
 * 3. Set NEW_ENCRYPTION_KEY and NEW_ENCRYPTION_HKDF_SALT (new values)
 * 4. Ensure no active API calls during migration
 * 5. Test on staging environment first
 */

import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Encryption configuration
const OLD_ENCRYPTION_KEY = process.env.OLD_ENCRYPTION_KEY;
const OLD_HKDF_SALT = process.env.OLD_ENCRYPTION_HKDF_SALT;
const NEW_ENCRYPTION_KEY = process.env.NEW_ENCRYPTION_KEY;
const NEW_HKDF_SALT = process.env.NEW_ENCRYPTION_HKDF_SALT;

// Validate required environment variables
if (!OLD_ENCRYPTION_KEY || OLD_ENCRYPTION_KEY.length !== 64) {
  console.error('❌ OLD_ENCRYPTION_KEY must be 64 hex characters');
  process.exit(1);
}

if (!OLD_HKDF_SALT || OLD_HKDF_SALT.length !== 64) {
  console.error('❌ OLD_ENCRYPTION_HKDF_SALT must be 64 hex characters');
  process.exit(1);
}

if (!NEW_ENCRYPTION_KEY || NEW_ENCRYPTION_KEY.length !== 64) {
  console.error('❌ NEW_ENCRYPTION_KEY must be 64 hex characters');
  process.exit(1);
}

if (!NEW_HKDF_SALT || NEW_HKDF_SALT.length !== 64) {
  console.error('❌ NEW_ENCRYPTION_HKDF_SALT must be 64 hex characters');
  process.exit(1);
}

// Encryption utilities
function deriveWorkspaceKey(
  workspaceId: string,
  masterKey: string,
  salt: string,
): Buffer {
  const info = Buffer.from(`workspace:${workspaceId}`);
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(masterKey, 'hex'),
      Buffer.from(salt, 'hex'),
      info,
      32,
    ),
  );
}

function decryptWithWorkspaceKey(
  workspaceId: string,
  encryptedData: string,
  ivHex: string,
  masterKey: string,
  salt: string,
): string {
  const workspaceKey = deriveWorkspaceKey(workspaceId, masterKey, salt);
  const parts = encryptedData.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }

  const authTag = Buffer.from(parts[0], 'hex');
  const ciphertext = parts[1];
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', workspaceKey, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

function encryptWithWorkspaceKey(
  workspaceId: string,
  plaintext: string,
  masterKey: string,
  salt: string,
): { encryptedData: string; iv: string } {
  const workspaceKey = deriveWorkspaceKey(workspaceId, masterKey, salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', workspaceKey, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encryptedData: `${authTag.toString('hex')}:${ciphertext}`,
    iv: iv.toString('hex'),
  };
}

// Main migration function
async function reencryptKeys() {
  console.log('🔐 BYOK Key Rotation Script');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Create database connection
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER || 'devos',
    password: process.env.DATABASE_PASSWORD || 'devos_password',
    database: process.env.DATABASE_NAME || 'devos_db',
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Connected to database');

    // Fetch all active BYOK keys
    const keys = await dataSource.query(
      'SELECT id, workspace_id, encrypted_key, encryption_iv FROM byok_secrets WHERE is_active = true',
    );

    console.log(`📦 Found ${keys.length} active BYOK keys to re-encrypt`);
    console.log('');

    if (keys.length === 0) {
      console.log('✅ No keys to re-encrypt');
      await dataSource.destroy();
      return;
    }

    // Confirmation prompt
    console.log('⚠️  WARNING: This will re-encrypt all BYOK keys');
    console.log('⚠️  Ensure you have backed up the database before proceeding');
    console.log('');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Begin transaction
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let successCount = 0;
      let errorCount = 0;

      for (const key of keys) {
        try {
          // Decrypt with old key
          const plaintext = decryptWithWorkspaceKey(
            key.workspace_id,
            key.encrypted_key,
            key.encryption_iv,
            OLD_ENCRYPTION_KEY!,
            OLD_HKDF_SALT!,
          );

          // Re-encrypt with new key
          const { encryptedData, iv } = encryptWithWorkspaceKey(
            key.workspace_id,
            plaintext,
            NEW_ENCRYPTION_KEY!,
            NEW_HKDF_SALT!,
          );

          // Update database
          await queryRunner.query(
            'UPDATE byok_secrets SET encrypted_key = $1, encryption_iv = $2, updated_at = NOW() WHERE id = $3',
            [encryptedData, iv, key.id],
          );

          successCount++;
          console.log(`✅ Re-encrypted key ${key.id} (workspace: ${key.workspace_id})`);
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to re-encrypt key ${key.id}:`, error);
        }
      }

      // Commit transaction if all succeeded
      if (errorCount === 0) {
        await queryRunner.commitTransaction();
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`✅ Successfully re-encrypted ${successCount} keys`);
        console.log('');
        console.log('⚠️  NEXT STEPS:');
        console.log('1. Update .env with NEW_ENCRYPTION_KEY and NEW_ENCRYPTION_HKDF_SALT');
        console.log('2. Restart application');
        console.log('3. Test BYOK key decryption');
        console.log('4. Keep old keys backed up for 30 days');
      } else {
        await queryRunner.rollbackTransaction();
        console.error('');
        console.error('═══════════════════════════════════════════════════════');
        console.error(`❌ Re-encryption failed for ${errorCount} keys`);
        console.error('❌ Transaction rolled back - no changes made');
        console.error('');
        console.error('Check error messages above and fix issues before retrying');
        process.exit(1);
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  } catch (error) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════');
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

// Run migration
reencryptKeys()
  .then(() => {
    console.log('');
    console.log('🎉 Key rotation complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
