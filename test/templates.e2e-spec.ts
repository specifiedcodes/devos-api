import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Templates E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/templates - Get all templates', () => {
    it('should return all 4 templates without authentication', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(4);
    });

    it('should return templates with all required fields', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates')
        .expect(200);

      const template = response.body[0];
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('category');
      expect(template).toHaveProperty('techStack');
      expect(template).toHaveProperty('defaultPreferences');
      expect(template).toHaveProperty('recommended');
      expect(template).toHaveProperty('tags');
    });

    it('should include the recommended Next.js SaaS Starter template', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates')
        .expect(200);

      const recommendedTemplate = response.body.find((t: any) => t.recommended === true);
      expect(recommendedTemplate).toBeDefined();
      expect(recommendedTemplate.id).toBe('nextjs-saas-starter');
      expect(recommendedTemplate.name).toBe('Next.js SaaS Starter');
      expect(recommendedTemplate.category).toBe('saas');
    });
  });

  describe('GET /api/v1/templates/:templateId - Get template by ID', () => {
    it('should return Next.js SaaS Starter for valid ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/nextjs-saas-starter')
        .expect(200);

      expect(response.body.id).toBe('nextjs-saas-starter');
      expect(response.body.name).toBe('Next.js SaaS Starter');
      expect(response.body.category).toBe('saas');
      expect(response.body.techStack).toBeDefined();
      expect(response.body.techStack.framework).toBe('Next.js 15');
      expect(response.body.defaultPreferences).toBeDefined();
      expect(response.body.defaultPreferences.repoStructure).toBe('polyrepo');
    });

    it('should return E-commerce Platform for valid ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/ecommerce-platform')
        .expect(200);

      expect(response.body.id).toBe('ecommerce-platform');
      expect(response.body.name).toBe('E-commerce Platform');
      expect(response.body.category).toBe('ecommerce');
    });

    it('should return Mobile App template for valid ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/mobile-app-react-native')
        .expect(200);

      expect(response.body.id).toBe('mobile-app-react-native');
      expect(response.body.name).toBe('Mobile App (React Native)');
      expect(response.body.category).toBe('mobile');
    });

    it('should return API Backend template for valid ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/api-backend-nestjs')
        .expect(200);

      expect(response.body.id).toBe('api-backend-nestjs');
      expect(response.body.name).toBe('API-Only Backend (NestJS)');
      expect(response.body.category).toBe('api');
    });

    it('should return 404 for invalid template ID', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/invalid-template-id')
        .expect(404);

      expect(response.body.statusCode).toBe(404);
      expect(response.body.message).toContain('invalid-template-id');
      expect(response.body.error).toBe('Not Found');
    });

    it('should work without authentication (public endpoint)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/templates/nextjs-saas-starter')
        .expect(200);
    });
  });

  describe('GET /api/v1/templates/category/:category - Get templates by category', () => {
    it('should return 1 template for category "saas"', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/category/saas')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].category).toBe('saas');
      expect(response.body[0].id).toBe('nextjs-saas-starter');
    });

    it('should return 1 template for category "ecommerce"', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/category/ecommerce')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].category).toBe('ecommerce');
      expect(response.body[0].id).toBe('ecommerce-platform');
    });

    it('should return 1 template for category "mobile"', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/category/mobile')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].category).toBe('mobile');
      expect(response.body[0].id).toBe('mobile-app-react-native');
    });

    it('should return 1 template for category "api"', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/category/api')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].category).toBe('api');
      expect(response.body[0].id).toBe('api-backend-nestjs');
    });

    it('should return empty array for invalid category', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/category/invalid-category')
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(0);
    });

    it('should work without authentication (public endpoint)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/templates/category/saas')
        .expect(200);
    });
  });

  describe('Response Structure Validation', () => {
    it('should return proper DTO structure matching schema', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates/nextjs-saas-starter')
        .expect(200);

      // Validate top-level structure
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        category: expect.any(String),
        recommended: expect.any(Boolean),
        tags: expect.any(Array),
      });

      // Validate techStack structure
      expect(response.body.techStack).toMatchObject({
        framework: expect.any(String),
        language: expect.any(String),
        testing: expect.any(Array),
      });

      // Validate defaultPreferences structure
      expect(response.body.defaultPreferences).toMatchObject({
        repoStructure: expect.stringMatching(/^(monorepo|polyrepo)$/),
        codeStyle: expect.any(String),
        testingStrategy: expect.any(String),
      });
    });

    it('should return Content-Type application/json', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Recommended Template Flag', () => {
    it('should have exactly one recommended template', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates')
        .expect(200);

      const recommendedTemplates = response.body.filter((t: any) => t.recommended === true);
      expect(recommendedTemplates).toHaveLength(1);
    });

    it('should flag Next.js SaaS Starter as recommended', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates')
        .expect(200);

      const recommended = response.body.find((t: any) => t.id === 'nextjs-saas-starter');
      expect(recommended.recommended).toBe(true);
    });

    it('should not flag other templates as recommended', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/templates')
        .expect(200);

      const otherTemplates = response.body.filter(
        (t: any) => t.id !== 'nextjs-saas-starter',
      );

      otherTemplates.forEach((template: any) => {
        expect(template.recommended).toBe(false);
      });
    });
  });
});
