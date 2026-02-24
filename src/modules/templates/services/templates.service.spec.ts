/**
 * TemplatesService Tests
 *
 * Story 19-1: Template Registry Backend
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TemplatesService } from './templates.service';
import { TemplateCategory } from '../constants/template-registry.constant';
import { Template } from '../../../database/entities/template.entity';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let templateRepo: jest.Mocked<Repository<Template>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        {
          provide: getRepositoryToken(Template),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
    templateRepo = module.get(getRepositoryToken(Template));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllTemplates', () => {
    it('should fallback to hardcoded templates when database is empty', async () => {
      // Database returns empty, should fallback to hardcoded
      const templates = await service.getAllTemplates();
      expect(templates).toHaveLength(4);
    });

    it('should return templates with all required fields', async () => {
      const templates = await service.getAllTemplates();
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

    it('should return templates with unique IDs', async () => {
      const templates = await service.getAllTemplates();
      const ids = templates.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(templates.length);
    });
  });

  describe('getTemplateById', () => {
    it('should return template for valid ID "nextjs-saas-starter"', async () => {
      const template = await service.getTemplateById('nextjs-saas-starter');
      expect(template).toBeDefined();
      expect(template.id).toBe('nextjs-saas-starter');
      expect(template.name).toBe('Next.js SaaS Starter');
      expect(template.category).toBe(TemplateCategory.SAAS);
    });

    it('should return template for valid ID "ecommerce-platform"', async () => {
      const template = await service.getTemplateById('ecommerce-platform');
      expect(template).toBeDefined();
      expect(template.id).toBe('ecommerce-platform');
      expect(template.name).toBe('E-commerce Platform');
    });

    it('should return template for valid ID "mobile-app-react-native"', async () => {
      const template = await service.getTemplateById('mobile-app-react-native');
      expect(template).toBeDefined();
      expect(template.id).toBe('mobile-app-react-native');
      expect(template.name).toBe('Mobile App (React Native)');
    });

    it('should return template for valid ID "api-backend-nestjs"', async () => {
      const template = await service.getTemplateById('api-backend-nestjs');
      expect(template).toBeDefined();
      expect(template.id).toBe('api-backend-nestjs');
      expect(template.name).toBe('API-Only Backend (NestJS)');
    });

    it('should throw NotFoundException for invalid template ID', async () => {
      await expect(service.getTemplateById('invalid-template-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with specific message for invalid ID', async () => {
      await expect(service.getTemplateById('nonexistent')).rejects.toThrow(
        "Template with ID 'nonexistent' not found",
      );
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should return 1 template for category "saas"', async () => {
      const templates = await service.getTemplatesByCategory(TemplateCategory.SAAS);
      expect(templates).toHaveLength(1);
      expect(templates[0].category).toBe(TemplateCategory.SAAS);
    });

    it('should return 1 template for category "ecommerce"', async () => {
      const templates = await service.getTemplatesByCategory(TemplateCategory.ECOMMERCE);
      expect(templates).toHaveLength(1);
      expect(templates[0].category).toBe(TemplateCategory.ECOMMERCE);
    });

    it('should return 1 template for category "mobile"', async () => {
      const templates = await service.getTemplatesByCategory(TemplateCategory.MOBILE);
      expect(templates).toHaveLength(1);
      expect(templates[0].category).toBe(TemplateCategory.MOBILE);
    });

    it('should return 1 template for category "api"', async () => {
      const templates = await service.getTemplatesByCategory(TemplateCategory.API);
      expect(templates).toHaveLength(1);
      expect(templates[0].category).toBe(TemplateCategory.API);
    });

    it('should return empty array for invalid category', async () => {
      const templates = await service.getTemplatesByCategory('invalid' as TemplateCategory);
      expect(templates).toEqual([]);
    });
  });

  describe('getRecommendedTemplate', () => {
    it('should return the recommended template', async () => {
      const template = await service.getRecommendedTemplate();
      expect(template).toBeDefined();
      expect(template.recommended).toBe(true);
    });

    it('should return Next.js SaaS Starter as recommended template', async () => {
      const template = await service.getRecommendedTemplate();
      expect(template.id).toBe('nextjs-saas-starter');
      expect(template.name).toBe('Next.js SaaS Starter');
    });
  });

  describe('getTemplateForProject', () => {
    it('should return techStack and preferences for valid template ID', async () => {
      const result = await service.getTemplateForProject('nextjs-saas-starter');
      expect(result).toHaveProperty('techStack');
      expect(result).toHaveProperty('preferences');
      expect(result.techStack).toHaveProperty('framework');
      expect(result.preferences).toHaveProperty('repoStructure');
    });

    it('should throw NotFoundException for invalid template ID', async () => {
      await expect(service.getTemplateForProject('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('validateTemplateId', () => {
    it('should return true for valid template ID', async () => {
      const result = await service.validateTemplateId('nextjs-saas-starter');
      expect(result).toBe(true);
    });

    it('should return false for invalid template ID', async () => {
      const result = await service.validateTemplateId('invalid-id');
      expect(result).toBe(false);
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

  // Synchronous methods for backward compatibility
  describe('getAllTemplatesSync', () => {
    it('should return all 4 hardcoded templates', () => {
      const templates = service.getAllTemplatesSync();
      expect(templates).toHaveLength(4);
    });
  });

  describe('getTemplateByIdSync', () => {
    it('should return template for valid ID', () => {
      const template = service.getTemplateByIdSync('nextjs-saas-starter');
      expect(template).toBeDefined();
      expect(template.id).toBe('nextjs-saas-starter');
    });

    it('should throw NotFoundException for invalid ID', () => {
      expect(() => service.getTemplateByIdSync('invalid-id')).toThrow(NotFoundException);
    });
  });

  describe('getTemplatesByCategorySync', () => {
    it('should return templates for valid category', () => {
      const templates = service.getTemplatesByCategorySync(TemplateCategory.SAAS);
      expect(templates).toHaveLength(1);
    });
  });
});
