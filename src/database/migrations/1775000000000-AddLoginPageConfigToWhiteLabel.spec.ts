import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AddLoginPageConfigToWhiteLabel1775000000000 } from './1775000000000-AddLoginPageConfigToWhiteLabel';
import { WhiteLabelConfig, BackgroundType } from '../entities/white-label-config.entity';

describe('AddLoginPageConfigToWhiteLabel Migration', () => {
  let dataSource: DataSource;
  let migration: AddLoginPageConfigToWhiteLabel1775000000000;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_DATABASE || 'devos_test',
          synchronize: false,
          dropSchema: false,
          entities: [WhiteLabelConfig],
        }),
        TypeOrmModule.forFeature([WhiteLabelConfig]),
      ],
    }).compile();

    dataSource = module.get<DataSource>(DataSource);
    migration = new AddLoginPageConfigToWhiteLabel1775000000000();
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('Migration up', () => {
    it('should run forward (up) without errors', async () => {
      await expect(migration.up(dataSource.createQueryRunner())).resolves.not.toThrow();
    });

    it('should add all new columns to white_label_configs table', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await migration.up(queryRunner);

      const table = await queryRunner.getTable('white_label_configs');
      expect(table).toBeDefined();

      const columnNames = table!.columns.map(col => col.name);
      expect(columnNames).toContain('show_devos_branding');
      expect(columnNames).toContain('background_type');
      expect(columnNames).toContain('background_value');
      expect(columnNames).toContain('hero_text');
      expect(columnNames).toContain('hero_subtext');
      expect(columnNames).toContain('custom_links');
      expect(columnNames).toContain('show_signup');
      expect(columnNames).toContain('login_page_css');

      await queryRunner.release();
    });

    it('should set correct default values for new columns', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await migration.up(queryRunner);

      const table = await queryRunner.getTable('white_label_configs');
      expect(table).toBeDefined();

      const showDevosBrandingCol = table!.findColumnByName('show_devos_branding');
      expect(showDevosBrandingCol?.default).toBe('false');

      const backgroundTypeCol = table!.findColumnByName('background_type');
      expect(backgroundTypeCol?.default).toBe("'color'::character varying");

      const backgroundValueCol = table!.findColumnByName('background_value');
      expect(backgroundValueCol?.default).toBe("'#f3f4f6'::character varying");

      const showSignupCol = table!.findColumnByName('show_signup');
      expect(showSignupCol?.default).toBe('false');

      await queryRunner.release();
    });

    it('should set nullable fields correctly', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await migration.up(queryRunner);

      const table = await queryRunner.getTable('white_label_configs');
      expect(table).toBeDefined();

      const heroTextCol = table!.findColumnByName('hero_text');
      expect(heroTextCol?.isNullable).toBe(true);

      const heroSubtextCol = table!.findColumnByName('hero_subtext');
      expect(heroSubtextCol?.isNullable).toBe(true);

      const loginPageCssCol = table!.findColumnByName('login_page_css');
      expect(loginPageCssCol?.isNullable).toBe(true);

      await queryRunner.release();
    });

    it('should verify custom_links is JSONB type', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await migration.up(queryRunner);

      const table = await queryRunner.getTable('white_label_configs');
      expect(table).toBeDefined();

      const customLinksCol = table!.findColumnByName('custom_links');
      expect(customLinksCol?.type).toBe('json');

      await queryRunner.release();
    });
  });

  describe('Migration down', () => {
    it('should run backward (down) without errors', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await migration.up(queryRunner);
      await expect(migration.down(queryRunner)).resolves.not.toThrow();
      await queryRunner.release();
    });

    it('should remove all added columns', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await migration.up(queryRunner);
      await migration.down(queryRunner);

      const table = await queryRunner.getTable('white_label_configs');
      expect(table).toBeDefined();

      const columnNames = table!.columns.map(col => col.name);
      expect(columnNames).not.toContain('show_devos_branding');
      expect(columnNames).not.toContain('background_type');
      expect(columnNames).not.toContain('background_value');
      expect(columnNames).not.toContain('hero_text');
      expect(columnNames).not.toContain('hero_subtext');
      expect(columnNames).not.toContain('custom_links');
      expect(columnNames).not.toContain('show_signup');
      expect(columnNames).not.toContain('login_page_css');

      await queryRunner.release();
    });
  });

  describe('Entity mapping', () => {
    it('should correctly map all new columns with default values', async () => {
      const repo = dataSource.getRepository(WhiteLabelConfig);
      const config = repo.create({
        workspaceId: 'test-workspace-id',
      });

      expect(config.showDevosBranding).toBe(false);
      expect(config.backgroundType).toBe(BackgroundType.COLOR);
      expect(config.backgroundValue).toBe('#f3f4f6');
      expect(config.showSignup).toBe(false);
      expect(config.customLinks).toEqual([]);
    });

    it('should have correct BackgroundType enum values', () => {
      expect(BackgroundType.COLOR).toBe('color');
      expect(BackgroundType.GRADIENT).toBe('gradient');
      expect(BackgroundType.IMAGE).toBe('image');
    });

    it('should store and retrieve custom_links JSONB array correctly', async () => {
      const repo = dataSource.getRepository(WhiteLabelConfig);
      const config = repo.create({
        workspaceId: 'test-workspace-id',
        customLinks: [
          { text: 'Privacy Policy', url: 'https://example.com/privacy' },
          { text: 'Terms of Service', url: 'https://example.com/terms' },
        ],
      });

      const saved = await repo.save(config);
      const retrieved = await repo.findOne({ where: { id: saved.id } });

      expect(retrieved?.customLinks).toHaveLength(2);
      expect(retrieved?.customLinks[0]).toEqual({
        text: 'Privacy Policy',
        url: 'https://example.com/privacy',
      });
      expect(retrieved?.customLinks[1]).toEqual({
        text: 'Terms of Service',
        url: 'https://example.com/terms',
      });

      await repo.remove(config);
    });

    it('should accept null values for nullable fields', async () => {
      const repo = dataSource.getRepository(WhiteLabelConfig);
      const config = repo.create({
        workspaceId: 'test-workspace-id',
        heroText: null,
        heroSubtext: null,
        loginPageCss: null,
      });

      const saved = await repo.save(config);
      expect(saved.heroText).toBeNull();
      expect(saved.heroSubtext).toBeNull();
      expect(saved.loginPageCss).toBeNull();

      await repo.remove(config);
    });

    it('should retain existing record values after migration', async () => {
      const repo = dataSource.getRepository(WhiteLabelConfig);
      
      const config = repo.create({
        workspaceId: 'test-workspace-id',
        appName: 'TestApp',
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
      });

      const savedBefore = await repo.save(config);
      
      const queryRunner = dataSource.createQueryRunner();
      await migration.up(queryRunner);
      await migration.down(queryRunner);
      await migration.up(queryRunner);
      await queryRunner.release();

      const retrieved = await repo.findOne({ where: { id: savedBefore.id } });
      expect(retrieved?.appName).toBe('TestApp');
      expect(retrieved?.primaryColor).toBe('#FF0000');
      expect(retrieved?.secondaryColor).toBe('#00FF00');

      await repo.remove(config);
    });
  });
});
