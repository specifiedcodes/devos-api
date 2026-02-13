import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplateCategory } from '../constants/template-registry.constant';

describe('TemplatesService', () => {
  let service: TemplatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplatesService],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllTemplates', () => {
    it('should return all 4 templates', () => {
      const templates = service.getAllTemplates();
      expect(templates).toHaveLength(4);
    });

    it('should return templates with all required fields', () => {
      const templates = service.getAllTemplates();
      templates.forEach((template) => {
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('category');
        expect(template).toHaveProperty('techStack');
        expect(template).toHaveProperty('defaultPreferences');
        expect(template).toHaveProperty('recommended');
        expect(template).toHaveProperty('tags');
      });
    });

    it('should return templates with unique IDs', () => {
      const templates = service.getAllTemplates();
      const ids = templates.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(templates.length);
    });
  });

  describe('getTemplateById', () => {
    it('should return template for valid ID "nextjs-saas-starter"', () => {
      const template = service.getTemplateById('nextjs-saas-starter');
      expect(template).toBeDefined();
      expect(template.id).toBe('nextjs-saas-starter');
      expect(template.name).toBe('Next.js SaaS Starter');
      expect(template.category).toBe(TemplateCategory.SAAS);
    });

    it('should return template for valid ID "ecommerce-platform"', () => {
      const template = service.getTemplateById('ecommerce-platform');
      expect(template).toBeDefined();
      expect(template.id).toBe('ecommerce-platform');
      expect(template.name).toBe('E-commerce Platform');
    });

    it('should return template for valid ID "mobile-app-react-native"', () => {
      const template = service.getTemplateById('mobile-app-react-native');
      expect(template).toBeDefined();
      expect(template.id).toBe('mobile-app-react-native');
      expect(template.name).toBe('Mobile App (React Native)');
    });

    it('should return template for valid ID "api-backend-nestjs"', () => {
      const template = service.getTemplateById('api-backend-nestjs');
      expect(template).toBeDefined();
      expect(template.id).toBe('api-backend-nestjs');
      expect(template.name).toBe('API-Only Backend (NestJS)');
    });

    it('should throw NotFoundException for invalid template ID', () => {
      expect(() => service.getTemplateById('invalid-template-id')).toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with specific message for invalid ID', () => {
      expect(() => service.getTemplateById('nonexistent')).toThrow(
        "Template with ID 'nonexistent' not found",
      );
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should return 1 template for category "saas"', () => {
      const templates = service.getTemplatesByCategory(TemplateCategory.SAAS);
      expect(templates).toHaveLength(1);
      expect(templates[0].category).toBe(TemplateCategory.SAAS);
    });

    it('should return 1 template for category "ecommerce"', () => {
      const templates = service.getTemplatesByCategory(TemplateCategory.ECOMMERCE);
      expect(templates).toHaveLength(1);
      expect(templates[0].category).toBe(TemplateCategory.ECOMMERCE);
    });

    it('should return 1 template for category "mobile"', () => {
      const templates = service.getTemplatesByCategory(TemplateCategory.MOBILE);
      expect(templates).toHaveLength(1);
      expect(templates[0].category).toBe(TemplateCategory.MOBILE);
    });

    it('should return 1 template for category "api"', () => {
      const templates = service.getTemplatesByCategory(TemplateCategory.API);
      expect(templates).toHaveLength(1);
      expect(templates[0].category).toBe(TemplateCategory.API);
    });

    it('should return empty array for invalid category', () => {
      const templates = service.getTemplatesByCategory('invalid' as TemplateCategory);
      expect(templates).toEqual([]);
    });
  });

  describe('getRecommendedTemplate', () => {
    it('should return the recommended template', () => {
      const template = service.getRecommendedTemplate();
      expect(template).toBeDefined();
      expect(template.recommended).toBe(true);
    });

    it('should return Next.js SaaS Starter as recommended template', () => {
      const template = service.getRecommendedTemplate();
      expect(template.id).toBe('nextjs-saas-starter');
      expect(template.name).toBe('Next.js SaaS Starter');
    });
  });

  describe('getTemplateForProject', () => {
    it('should return techStack and preferences for valid template ID', () => {
      const result = service.getTemplateForProject('nextjs-saas-starter');
      expect(result).toHaveProperty('techStack');
      expect(result).toHaveProperty('preferences');
      expect(result.techStack).toHaveProperty('framework');
      expect(result.preferences).toHaveProperty('repoStructure');
    });

    it('should throw NotFoundException for invalid template ID', () => {
      expect(() => service.getTemplateForProject('invalid-id')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('validateTemplateId', () => {
    it('should return true for valid template ID', () => {
      expect(service.validateTemplateId('nextjs-saas-starter')).toBe(true);
    });

    it('should return false for invalid template ID', () => {
      expect(service.validateTemplateId('invalid-id')).toBe(false);
    });
  });

  describe('validateCategory', () => {
    it('should return true for valid category', () => {
      expect(service.validateCategory(TemplateCategory.SAAS)).toBe(true);
    });

    it('should return false for invalid category', () => {
      expect(service.validateCategory('invalid' as TemplateCategory)).toBe(false);
    });
  });
});
