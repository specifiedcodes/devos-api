import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateProjectsAndPreferences1738360000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create projects table
    await queryRunner.createTable(
      new Table({
        name: 'projects',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'template_id',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'github_repo_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'deployment_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_by_user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'archived', 'deleted'],
            default: "'active'",
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create project_preferences table
    await queryRunner.createTable(
      new Table({
        name: 'project_preferences',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'repository_structure',
            type: 'enum',
            enum: ['monorepo', 'polyrepo'],
            default: "'monorepo'",
            isNullable: false,
          },
          {
            name: 'code_style',
            type: 'enum',
            enum: ['functional', 'oop'],
            default: "'functional'",
            isNullable: false,
          },
          {
            name: 'git_workflow',
            type: 'enum',
            enum: ['github_flow', 'git_flow'],
            default: "'github_flow'",
            isNullable: false,
          },
          {
            name: 'testing_strategy',
            type: 'enum',
            enum: ['unit_heavy', 'balanced', 'e2e_heavy'],
            default: "'balanced'",
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes on projects table
    await queryRunner.createIndex(
      'projects',
      new TableIndex({
        name: 'idx_projects_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );

    await queryRunner.createIndex(
      'projects',
      new TableIndex({
        name: 'idx_projects_created_by_user_id',
        columnNames: ['created_by_user_id'],
      }),
    );

    // Unique constraint on (workspace_id, name) for project name uniqueness within workspace
    await queryRunner.createIndex(
      'projects',
      new TableIndex({
        name: 'idx_projects_workspace_id_name_unique',
        columnNames: ['workspace_id', 'name'],
        isUnique: true,
      }),
    );

    // Create index on project_preferences
    await queryRunner.createIndex(
      'project_preferences',
      new TableIndex({
        name: 'idx_project_preferences_project_id',
        columnNames: ['project_id'],
        isUnique: true,
      }),
    );

    // Foreign keys for projects table
    await queryRunner.createForeignKey(
      'projects',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'projects',
      new TableForeignKey({
        columnNames: ['created_by_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Foreign key for project_preferences table
    await queryRunner.createForeignKey(
      'project_preferences',
      new TableForeignKey({
        columnNames: ['project_id'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop project_preferences table first (has foreign key to projects)
    const preferencesTable = await queryRunner.getTable('project_preferences');
    if (preferencesTable) {
      const foreignKeys = preferencesTable.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('project_preferences', foreignKey);
      }
    }
    await queryRunner.dropTable('project_preferences', true, true, true);

    // Drop projects table
    const projectsTable = await queryRunner.getTable('projects');
    if (projectsTable) {
      const foreignKeys = projectsTable.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('projects', foreignKey);
      }
    }
    await queryRunner.dropTable('projects', true, true, true);
  }
}
