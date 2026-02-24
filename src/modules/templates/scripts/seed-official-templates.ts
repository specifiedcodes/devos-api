/**
 * Seed Official Templates Script
 *
 * Story 19-1: Template Registry Backend
 *
 * This script migrates the hardcoded templates from TEMPLATE_REGISTRY
 * to the database as official templates.
 *
 * Usage:
 *   npx ts-node src/modules/templates/scripts/seed-official-templates.ts
 *
 * Or add to package.json:
 *   "templates:seed": "ts-node src/modules/templates/scripts/seed-official-templates.ts"
 */
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Import entities
import { Template, TemplateCategory, TemplateSourceType } from '../../../database/entities/template.entity';

// Import hardcoded templates
import {
  TEMPLATE_REGISTRY,
  TemplateCategory as LegacyCategory,
  ProjectTemplate,
} from '../constants/template-registry.constant';

/**
 * Map legacy category to new category
 */
function mapCategory(legacyCategory: LegacyCategory): TemplateCategory {
  const categoryMap: Record<string, TemplateCategory> = {
    [LegacyCategory.SAAS]: TemplateCategory.SAAS,
    [LegacyCategory.ECOMMERCE]: TemplateCategory.ECOMMERCE,
    [LegacyCategory.MOBILE]: TemplateCategory.MOBILE,
    [LegacyCategory.API]: TemplateCategory.API,
  };
  return categoryMap[legacyCategory] || TemplateCategory.WEB_APP;
}

/**
 * Convert legacy ProjectTemplate to new Template entity
 */
function convertToEntity(template: ProjectTemplate): Partial<Template> {
  return {
    workspaceId: null, // Official templates have no workspace
    name: template.id,
    displayName: template.name,
    description: template.description,
    longDescription: null,
    version: '1.0.0',
    schemaVersion: 'v1',
    definition: {
      stack: {
        frontend: template.techStack.framework,
        backend: template.techStack.apiLayer,
        database: template.techStack.database,
        styling: template.techStack.styling,
        auth: template.techStack.additional?.find((a) => a.includes('Auth')) || undefined,
        deployment: template.defaultPreferences.cicd,
      },
      variables: [],
      files: {
        source_type: TemplateSourceType.GIT,
        repository: undefined,
        branch: 'main',
      },
      post_install: [],
    },
    category: mapCategory(template.category),
    tags: template.tags || [],
    icon: template.icon || 'layout-dashboard',
    screenshots: [],
    stackSummary: {
      frontend: template.techStack.framework,
      backend: template.techStack.apiLayer,
      database: template.techStack.database,
      styling: template.techStack.styling,
    },
    variables: [],
    sourceType: TemplateSourceType.GIT,
    sourceUrl: null,
    sourceBranch: 'main',
    isOfficial: true,
    isPublished: true,
    isActive: true,
    createdBy: null,
  };
}

/**
 * Main seed function
 */
async function seedTemplates(): Promise<void> {
  console.log('Starting official templates seed...\n');

  // Create data source
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'devos',
    entities: [Template],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('Database connection established\n');

    const templateRepository = dataSource.getRepository(Template);

    let migrated = 0;
    let skipped = 0;

    for (const hardcodedTemplate of TEMPLATE_REGISTRY) {
      // Check if template already exists by name
      const existing = await templateRepository.findOne({
        where: { name: hardcodedTemplate.id },
      });

      if (existing) {
        console.log(`[SKIP] Template '${hardcodedTemplate.id}' already exists (ID: ${existing.id})`);
        skipped++;
        continue;
      }

      // Convert and create new template
      const entityData = convertToEntity(hardcodedTemplate);
      const template = templateRepository.create(entityData);
      const saved = await templateRepository.save(template);

      console.log(`[MIGRATED] Template '${hardcodedTemplate.id}' created (ID: ${saved.id})`);
      migrated++;
    }

    console.log('\n--- Seed Summary ---');
    console.log(`Migrated: ${migrated}`);
    console.log(`Skipped:  ${skipped}`);
    console.log(`Total:    ${TEMPLATE_REGISTRY.length}`);
    console.log('--------------------\n');
    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Error during seed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

// Run the seed script
seedTemplates().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
