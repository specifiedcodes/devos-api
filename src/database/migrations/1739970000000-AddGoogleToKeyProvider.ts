import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleToKeyProvider1739970000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'google' to the existing KeyProvider enum type in PostgreSQL
    await queryRunner.query(`
      ALTER TYPE public.byok_secrets_provider_enum ADD VALUE IF NOT EXISTS 'google';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing values from an enum type directly.
    // To revert, you would need to create a new enum type without 'google',
    // migrate all data, and swap the types. This is intentionally left as a no-op
    // since removing an enum value is a destructive operation.
    // Any rows with provider='google' would need to be deleted first.
  }
}
