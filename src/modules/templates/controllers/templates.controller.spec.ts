import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from '../services/templates.service';
import { TemplateCategory } from '../constants/template-registry.constant';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: TemplatesService;

  const mockTemplate = {
    id: 'nextjs-saas-starter',
    name: 'Next.js SaaS Starter',
    description: 'Full-stack SaaS template',
    category: TemplateCategory.SAAS,
    techStack: {
      framework: 'Next.js 15',
      language: 'TypeScript',
      testing: ['Jest'],
    },
    defaultPreferences: {
      repoStructure: 'polyrepo' as const,
      codeStyle: 'ESLint + Prettier',
      testingStrategy: 'Jest',
    },
    recommended: true,
    tags: ['saas'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [
        {
          provide: TemplatesService,
          useValue: {
            getAllTemplates: jest.fn(),
            getTemplateById: jest.fn(),
            getTemplatesByCategory: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TemplatesController>(TemplatesController);
    service = module.get<TemplatesService>(TemplatesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllTemplates', () => {
    it('should return all templates', () => {
      const mockTemplates = [mockTemplate];
      jest.spyOn(service, 'getAllTemplates').mockReturnValue(mockTemplates);

      const result = controller.getAllTemplates();

      expect(result).toEqual(mockTemplates);
      expect(service.getAllTemplates).toHaveBeenCalled();
    });
  });

  describe('getTemplateById', () => {
    it('should return a template for valid ID', () => {
      jest.spyOn(service, 'getTemplateById').mockReturnValue(mockTemplate);

      const result = controller.getTemplateById('nextjs-saas-starter');

      expect(result).toEqual(mockTemplate);
      expect(service.getTemplateById).toHaveBeenCalledWith('nextjs-saas-starter');
    });

    it('should throw NotFoundException for invalid ID', () => {
      jest
        .spyOn(service, 'getTemplateById')
        .mockImplementation(() => {
          throw new NotFoundException("Template with ID 'invalid' not found");
        });

      expect(() => controller.getTemplateById('invalid')).toThrow(NotFoundException);
      expect(service.getTemplateById).toHaveBeenCalledWith('invalid');
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should return templates for valid category', () => {
      const mockTemplates = [mockTemplate];
      jest.spyOn(service, 'getTemplatesByCategory').mockReturnValue(mockTemplates);

      const result = controller.getTemplatesByCategory(TemplateCategory.SAAS);

      expect(result).toEqual(mockTemplates);
      expect(service.getTemplatesByCategory).toHaveBeenCalledWith(TemplateCategory.SAAS);
    });

    it('should return empty array for category with no templates', () => {
      jest.spyOn(service, 'getTemplatesByCategory').mockReturnValue([]);

      const result = controller.getTemplatesByCategory(TemplateCategory.SAAS);

      expect(result).toEqual([]);
      expect(service.getTemplatesByCategory).toHaveBeenCalledWith(TemplateCategory.SAAS);
    });
  });
});
