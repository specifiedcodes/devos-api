import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * CreateIncidentTables Migration
 * Story 14.9: Incident Management (AC9)
 *
 * Creates incidents and incident_updates tables with all columns,
 * indexes, and foreign keys.
 */
export class CreateIncidentTables1740200000000 implements MigrationInterface {
  name = 'CreateIncidentTables1740200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create incident severity enum
    await queryRunner.query(
      `CREATE TYPE "incident_severity_enum" AS ENUM('critical', 'major', 'minor')`,
    );

    // Create incident status enum
    await queryRunner.query(
      `CREATE TYPE "incident_status_enum" AS ENUM('investigating', 'identified', 'monitoring', 'resolved')`,
    );

    // Create incident update status enum
    await queryRunner.query(
      `CREATE TYPE "incident_update_status_enum" AS ENUM('investigating', 'identified', 'monitoring', 'resolved')`,
    );

    // Create incidents table
    await queryRunner.createTable(
      new Table({
        name: 'incidents',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'severity',
            type: 'incident_severity_enum',
            default: "'minor'",
          },
          {
            name: 'status',
            type: 'incident_status_enum',
            default: "'investigating'",
          },
          {
            name: 'affectedServices',
            type: 'text',
            default: "''",
          },
          {
            name: 'alertHistoryId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'createdBy',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'postMortemUrl',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'resolvedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create incident_updates table
    await queryRunner.createTable(
      new Table({
        name: 'incident_updates',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'incidentId',
            type: 'uuid',
          },
          {
            name: 'message',
            type: 'text',
          },
          {
            name: 'status',
            type: 'incident_update_status_enum',
          },
          {
            name: 'author',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Add foreign key from incident_updates to incidents
    await queryRunner.createForeignKey(
      'incident_updates',
      new TableForeignKey({
        columnNames: ['incidentId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'incidents',
        onDelete: 'CASCADE',
      }),
    );

    // Create indexes on incidents table
    await queryRunner.createIndex(
      'incidents',
      new TableIndex({ name: 'IDX_incidents_status', columnNames: ['status'] }),
    );
    await queryRunner.createIndex(
      'incidents',
      new TableIndex({
        name: 'IDX_incidents_severity',
        columnNames: ['severity'],
      }),
    );
    await queryRunner.createIndex(
      'incidents',
      new TableIndex({
        name: 'IDX_incidents_createdAt',
        columnNames: ['createdAt'],
      }),
    );
    await queryRunner.createIndex(
      'incidents',
      new TableIndex({
        name: 'IDX_incidents_alertHistoryId',
        columnNames: ['alertHistoryId'],
      }),
    );

    // Create indexes on incident_updates table
    await queryRunner.createIndex(
      'incident_updates',
      new TableIndex({
        name: 'IDX_incident_updates_incidentId',
        columnNames: ['incidentId'],
      }),
    );
    await queryRunner.createIndex(
      'incident_updates',
      new TableIndex({
        name: 'IDX_incident_updates_createdAt',
        columnNames: ['createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('incident_updates', 'IDX_incident_updates_createdAt');
    await queryRunner.dropIndex('incident_updates', 'IDX_incident_updates_incidentId');
    await queryRunner.dropIndex('incidents', 'IDX_incidents_alertHistoryId');
    await queryRunner.dropIndex('incidents', 'IDX_incidents_createdAt');
    await queryRunner.dropIndex('incidents', 'IDX_incidents_severity');
    await queryRunner.dropIndex('incidents', 'IDX_incidents_status');

    // Drop tables
    await queryRunner.dropTable('incident_updates');
    await queryRunner.dropTable('incidents');

    // Drop enums
    await queryRunner.query('DROP TYPE IF EXISTS "incident_update_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "incident_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "incident_severity_enum"');
  }
}
