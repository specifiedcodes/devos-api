import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: CreateAlertTables
 * Story 14.8: Alert Rules & Notifications (AC15)
 *
 * Creates alert_rules and alert_history tables with all required columns and indexes.
 */
export class CreateAlertTables1740100000000 implements MigrationInterface {
  name = 'CreateAlertTables1740100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "alert_rule_type_enum" AS ENUM ('threshold', 'health_check', 'comparison')
    `);

    await queryRunner.query(`
      CREATE TYPE "alert_operator_enum" AS ENUM ('gt', 'gte', 'lt', 'lte', 'eq', 'neq')
    `);

    await queryRunner.query(`
      CREATE TYPE "alert_severity_enum" AS ENUM ('critical', 'warning', 'info')
    `);

    await queryRunner.query(`
      CREATE TYPE "alert_history_status_enum" AS ENUM ('fired', 'acknowledged', 'silenced', 'resolved', 'auto_resolved')
    `);

    // Create alert_rules table
    await queryRunner.query(`
      CREATE TABLE "alert_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "ruleType" "alert_rule_type_enum" NOT NULL DEFAULT 'threshold',
        "condition" varchar(500) NOT NULL,
        "operator" "alert_operator_enum" NOT NULL DEFAULT 'gt',
        "threshold" varchar(255) NOT NULL,
        "durationSeconds" int NOT NULL DEFAULT 300,
        "severity" "alert_severity_enum" NOT NULL DEFAULT 'warning',
        "channels" text NOT NULL DEFAULT 'in_app',
        "enabled" boolean NOT NULL DEFAULT true,
        "cooldownSeconds" int NOT NULL DEFAULT 3600,
        "metadata" jsonb,
        "createdBy" varchar(50) NOT NULL DEFAULT 'system',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alert_rules" PRIMARY KEY ("id")
      )
    `);

    // Create alert_history table
    await queryRunner.query(`
      CREATE TABLE "alert_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "alertRuleId" uuid NOT NULL,
        "alertName" varchar(255) NOT NULL,
        "severity" "alert_severity_enum" NOT NULL,
        "status" "alert_history_status_enum" NOT NULL DEFAULT 'fired',
        "message" text NOT NULL,
        "context" jsonb,
        "notifiedChannels" text,
        "acknowledgedBy" varchar(50),
        "acknowledgedAt" TIMESTAMP,
        "resolvedAt" TIMESTAMP,
        "resolutionNote" text,
        "firedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alert_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alert_history_rule" FOREIGN KEY ("alertRuleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for alert_rules
    await queryRunner.query(`CREATE INDEX "IDX_alert_rules_enabled" ON "alert_rules" ("enabled")`);
    await queryRunner.query(`CREATE INDEX "IDX_alert_rules_createdBy" ON "alert_rules" ("createdBy")`);

    // Create indexes for alert_history
    await queryRunner.query(`CREATE INDEX "IDX_alert_history_alertRuleId" ON "alert_history" ("alertRuleId")`);
    await queryRunner.query(`CREATE INDEX "IDX_alert_history_severity" ON "alert_history" ("severity")`);
    await queryRunner.query(`CREATE INDEX "IDX_alert_history_status" ON "alert_history" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_alert_history_firedAt" ON "alert_history" ("firedAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_alert_history_firedAt"`);
    await queryRunner.query(`DROP INDEX "IDX_alert_history_status"`);
    await queryRunner.query(`DROP INDEX "IDX_alert_history_severity"`);
    await queryRunner.query(`DROP INDEX "IDX_alert_history_alertRuleId"`);
    await queryRunner.query(`DROP INDEX "IDX_alert_rules_createdBy"`);
    await queryRunner.query(`DROP INDEX "IDX_alert_rules_enabled"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "alert_history"`);
    await queryRunner.query(`DROP TABLE "alert_rules"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE "alert_history_status_enum"`);
    await queryRunner.query(`DROP TYPE "alert_severity_enum"`);
    await queryRunner.query(`DROP TYPE "alert_operator_enum"`);
    await queryRunner.query(`DROP TYPE "alert_rule_type_enum"`);
  }
}
