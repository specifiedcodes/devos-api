/**
 * PlannerDocumentValidatorService Tests
 * Story 11.6: Planner Agent CLI Integration
 *
 * Tests for document validation, path extraction, and BMAD template checks.
 */
import * as fs from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { PlannerDocumentValidatorService } from './planner-document-validator.service';

jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('PlannerDocumentValidatorService', () => {
  let service: PlannerDocumentValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlannerDocumentValidatorService],
    }).compile();

    service = module.get<PlannerDocumentValidatorService>(
      PlannerDocumentValidatorService,
    );

    jest.clearAllMocks();
  });

  // ─── validateDocuments ──────────────────────────────────────────────────────

  describe('validateDocuments', () => {
    it('should validate all generated documents', async () => {
      mockFs.existsSync.mockImplementation((p: any) => {
        const pathStr = p.toString();
        return (
          pathStr.includes('planning-artifacts') ||
          pathStr.includes('implementation-artifacts') ||
          pathStr.includes('epic-12')
        );
      });
      mockFs.readdirSync.mockImplementation((p: any) => {
        const pathStr = p.toString();
        if (pathStr.includes('epics')) {
          return ['epic-12-memory.md'] as any;
        }
        if (pathStr.includes('planning-artifacts')) {
          return ['prd.md'] as any;
        }
        if (pathStr.includes('implementation-artifacts')) {
          return ['12-1-setup.md', 'sprint-status.yaml'] as any;
        }
        return [] as any;
      });
      mockFs.readFileSync.mockImplementation((p: any) => {
        const pathStr = p.toString();
        if (pathStr.includes('epic-12')) {
          return '# Epic 12: Memory\n\nDescription: overview of stories\n\n## Stories\n- Story 12-1';
        }
        if (pathStr.includes('prd')) {
          return '# PRD\n\n## Overview\nProduct overview\n\n## Problem Statement\nProblem\n\n## Requirements\nReqs';
        }
        if (pathStr.includes('12-1')) {
          return '# Story 12.1\n\n## Acceptance Criteria\n1. Given x When y Then z\n\n## Tasks\n- [ ] Task 1';
        }
        if (pathStr.includes('sprint-status')) {
          return 'development_status:\n  epic-12: in-progress\n  12-1: backlog';
        }
        return '';
      });

      const result = await service.validateDocuments(
        '/workspace',
        'create-project-plan',
      );

      expect(result.totalDocuments).toBeGreaterThan(0);
      expect(result.documents.length).toBeGreaterThan(0);
    });

    it('should return valid=true when all documents pass', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((p: any) => {
        const pathStr = p.toString();
        if (pathStr.includes('epics')) {
          return ['epic-12-memory.md'] as any;
        }
        if (pathStr.includes('planning-artifacts') && !pathStr.includes('epics')) {
          return [] as any;
        }
        return [] as any;
      });
      mockFs.readFileSync.mockReturnValue(
        '# Epic 12: Memory\n\nDescription: overview of stories\n\n## Stories\n- Story 12-1',
      );

      const result = await service.validateDocuments(
        '/workspace',
        'breakdown-epic',
      );

      expect(result.valid).toBe(true);
      expect(result.validDocuments).toBe(result.totalDocuments);
    });

    it('should return issues for invalid documents', async () => {
      mockFs.existsSync.mockImplementation((p: any) => {
        return p.toString().includes('implementation-artifacts');
      });
      mockFs.readdirSync.mockImplementation((p: any) => {
        if (p.toString().includes('implementation-artifacts')) {
          return ['12-1-setup.md'] as any;
        }
        return [] as any;
      });
      mockFs.readFileSync.mockReturnValue('Just some random text with no structure');

      const result = await service.validateDocuments(
        '/workspace',
        'create-stories',
      );

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  // ─── extractDocumentPaths ────────────────────────────────────────────────────

  describe('extractDocumentPaths', () => {
    it('should extract file paths from CLI output', () => {
      const cliOutput = [
        'Starting planning...',
        'Created file: _bmad-output/planning-artifacts/prd.md',
        'Wrote to: _bmad-output/implementation-artifacts/12-1-setup.md',
        'Modified: _bmad-output/implementation-artifacts/sprint-status.yaml',
        'Done!',
      ];

      const paths = service.extractDocumentPaths(cliOutput);

      expect(paths).toContain('_bmad-output/planning-artifacts/prd.md');
      expect(paths).toContain('_bmad-output/implementation-artifacts/12-1-setup.md');
      expect(paths).toContain(
        '_bmad-output/implementation-artifacts/sprint-status.yaml',
      );
    });

    it('should handle CLI output with no file paths', () => {
      const cliOutput = [
        'Starting planning...',
        'Thinking about architecture...',
        'Done!',
      ];

      const paths = service.extractDocumentPaths(cliOutput);

      expect(paths).toHaveLength(0);
    });

    it('should deduplicate file paths', () => {
      const cliOutput = [
        'Created file: _bmad-output/planning-artifacts/prd.md',
        'Modified: _bmad-output/planning-artifacts/prd.md',
      ];

      const paths = service.extractDocumentPaths(cliOutput);

      const prdPaths = paths.filter((p) => p.includes('prd.md'));
      expect(prdPaths).toHaveLength(1);
    });
  });

  // ─── validateDocument ────────────────────────────────────────────────────────

  describe('validateDocument', () => {
    it('should validate epic file has required sections', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        '# Epic 12: Memory Management\n\n## Description\nThis epic covers memory.\n\n## Stories\n- Story 12-1\n- Story 12-2',
      );

      const result = await service.validateDocument('/path/epic-12.md', 'epic');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should validate story file has acceptance criteria', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        '# Story 12.1: Setup\n\n## Acceptance Criteria\n1. Given setup When running Then works\n\n## Tasks\n- [ ] Task 1\n- [ ] Task 2',
      );

      const result = await service.validateDocument('/path/12-1-setup.md', 'story');

      expect(result.valid).toBe(true);
      expect(result.hasAcceptanceCriteria).toBe(true);
      expect(result.hasTaskBreakdown).toBe(true);
    });

    it('should validate PRD file has required sections', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        '# PRD\n\n## Overview\nProduct overview\n\n## Problem Statement\nProblem description\n\n## Requirements\n- Req 1\n- Req 2',
      );

      const result = await service.validateDocument('/path/prd.md', 'prd');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should validate architecture file has required sections', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        '# Architecture\n\n## Tech Stack\nNestJS, TypeScript\n\n## Components\n- API Server\n\n## Data Model\nPostgreSQL schema',
      );

      const result = await service.validateDocument('/path/architecture.md', 'architecture');

      expect(result.valid).toBe(true);
    });

    it('should return valid=true for well-formed documents', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        '# Epic 12\n\n## Description\nOverview text\n\n## Stories\n- Story 12-1',
      );

      const result = await service.validateDocument('/path/epic.md', 'epic');

      expect(result.valid).toBe(true);
    });

    it('should return issues list for malformed documents', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('No structure at all, no heading, no sections');

      const result = await service.validateDocument('/path/epic.md', 'epic');

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should handle file not found gracefully', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await service.validateDocument('/path/missing.md', 'story');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('File not found');
    });

    it('should validate sprint-status document', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        'development_status:\n  epic-12: in-progress\n  12-1: backlog',
      );

      const result = await service.validateDocument(
        '/path/sprint-status.yaml',
        'sprint-status',
      );

      expect(result.valid).toBe(true);
    });

    it('should report invalid sprint-status YAML', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('just plain text without any colons');

      const result = await service.validateDocument(
        '/path/sprint-status.yaml',
        'sprint-status',
      );

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should handle story without acceptance criteria', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        '# Story 12.1: Setup\n\nJust a description, no criteria, no tasks.',
      );

      const result = await service.validateDocument('/path/12-1.md', 'story');

      expect(result.valid).toBe(false);
      expect(result.hasAcceptanceCriteria).toBe(false);
    });

    it('should handle PRD missing overview section', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(
        '# PRD\n\n## Problem Statement\nProblem\n\n## Requirements\nReqs',
      );

      const result = await service.validateDocument('/path/prd.md', 'prd');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing overview section');
    });
  });
});
