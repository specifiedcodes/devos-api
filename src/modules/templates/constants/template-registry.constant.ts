/**
 * Template Registry - Hardcoded Project Templates
 *
 * This file contains predefined project templates for DevOS.
 * Templates are stored as TypeScript constants (not in database) for MVP.
 *
 * Design Decision: Hardcoded for simplicity - only 4 templates, unlikely to change frequently.
 * Future: Can migrate to database if template marketplace is added.
 */

export enum TemplateCategory {
  SAAS = 'saas',
  ECOMMERCE = 'ecommerce',
  MOBILE = 'mobile',
  API = 'api',
}

export interface TechStack {
  framework: string;
  language: string;
  styling?: string;
  database?: string;
  orm?: string;
  apiLayer?: string;
  testing: string[];
  additional?: string[];
}

export interface DefaultPreferences {
  repoStructure: 'monorepo' | 'polyrepo';
  codeStyle: string;
  testingStrategy: string;
  cicd?: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  techStack: TechStack;
  defaultPreferences: DefaultPreferences;
  icon?: string;
  recommended: boolean;
  tags: string[];
}

/**
 * Template Registry - 4 Predefined Templates
 * All templates are readonly and cannot be modified at runtime
 */
export const TEMPLATE_REGISTRY: readonly ProjectTemplate[] = [
  // Template 1: Next.js SaaS Starter (RECOMMENDED)
  {
    id: 'nextjs-saas-starter',
    name: 'Next.js SaaS Starter',
    description:
      'Full-stack SaaS template with authentication, billing, dashboard, and multi-tenancy. Includes user management, subscription handling, and analytics integration. Perfect for B2B or B2C SaaS products.',
    category: TemplateCategory.SAAS,
    techStack: {
      framework: 'Next.js 15',
      language: 'TypeScript',
      styling: 'Tailwind CSS',
      database: 'PostgreSQL',
      orm: 'Prisma',
      apiLayer: 'tRPC',
      testing: ['Jest', 'React Testing Library', 'Playwright'],
      additional: ['NextAuth.js', 'Stripe', 'Resend (email)'],
    },
    defaultPreferences: {
      repoStructure: 'polyrepo',
      codeStyle: 'ESLint + Prettier',
      testingStrategy: 'Jest + RTL + Playwright',
      cicd: 'GitHub Actions',
    },
    icon: 'rocket',
    recommended: true,
    tags: ['saas', 'fullstack', 'nextjs', 'typescript', 'tailwind'],
  },

  // Template 2: E-commerce Platform
  {
    id: 'ecommerce-platform',
    name: 'E-commerce Platform',
    description:
      'E-commerce platform with product management, shopping cart, checkout, and order tracking. Integrated with Stripe for payments and Shopify API for product sync. Includes admin dashboard and customer portal.',
    category: TemplateCategory.ECOMMERCE,
    techStack: {
      framework: 'Next.js 15',
      language: 'TypeScript',
      styling: 'Tailwind CSS',
      database: 'PostgreSQL',
      orm: 'Prisma',
      apiLayer: 'REST API',
      testing: ['Jest', 'Playwright'],
      additional: ['Stripe', 'Shopify API', 'NextAuth.js'],
    },
    defaultPreferences: {
      repoStructure: 'monorepo',
      codeStyle: 'ESLint + Prettier',
      testingStrategy: 'Jest + Playwright',
      cicd: 'GitHub Actions',
    },
    icon: 'shopping-cart',
    recommended: false,
    tags: ['ecommerce', 'stripe', 'shopify', 'nextjs', 'typescript'],
  },

  // Template 3: Mobile App (React Native)
  {
    id: 'mobile-app-react-native',
    name: 'Mobile App (React Native)',
    description:
      'Cross-platform mobile app template with navigation, authentication, and API integration. Built with React Native and Expo for rapid development. Includes push notifications, offline support, and analytics.',
    category: TemplateCategory.MOBILE,
    techStack: {
      framework: 'React Native',
      language: 'TypeScript',
      styling: 'NativeWind (Tailwind for RN)',
      database: 'SQLite (local)',
      orm: 'WatermelonDB',
      apiLayer: 'REST API',
      testing: ['Jest', 'Detox'],
      additional: ['Expo', 'React Navigation', 'Firebase (push notifications)'],
    },
    defaultPreferences: {
      repoStructure: 'monorepo',
      codeStyle: 'ESLint + Prettier',
      testingStrategy: 'Jest + Detox',
      cicd: 'GitHub Actions + EAS Build',
    },
    icon: 'mobile',
    recommended: false,
    tags: ['mobile', 'react-native', 'expo', 'typescript', 'cross-platform'],
  },

  // Template 4: API-Only Backend (NestJS)
  {
    id: 'api-backend-nestjs',
    name: 'API-Only Backend (NestJS)',
    description:
      'RESTful API backend with authentication, database ORM, and auto-generated API docs. Built with NestJS for scalable and maintainable backend services. Includes JWT auth, TypeORM, and Swagger documentation.',
    category: TemplateCategory.API,
    techStack: {
      framework: 'NestJS',
      language: 'TypeScript',
      database: 'PostgreSQL',
      orm: 'TypeORM',
      apiLayer: 'REST API',
      testing: ['Jest', 'Supertest'],
      additional: ['Swagger', 'JWT', 'class-validator', 'class-transformer'],
    },
    defaultPreferences: {
      repoStructure: 'polyrepo',
      codeStyle: 'ESLint + Prettier',
      testingStrategy: 'Jest + Supertest',
      cicd: 'GitHub Actions',
    },
    icon: 'server',
    recommended: false,
    tags: ['api', 'backend', 'nestjs', 'typescript', 'rest'],
  },
];

/**
 * Helper to get all template IDs as a readonly array
 */
export const TEMPLATE_IDS = TEMPLATE_REGISTRY.map((t) => t.id) as readonly string[];

/**
 * Helper to get all template categories as a readonly array
 */
export const TEMPLATE_CATEGORIES = Object.values(TemplateCategory) as readonly string[];
