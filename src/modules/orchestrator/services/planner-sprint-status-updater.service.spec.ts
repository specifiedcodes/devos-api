/**
 * PlannerSprintStatusUpdaterService Tests
 * Story 11.6: Planner Agent CLI Integration
 *
 * Tests for sprint-status.yaml management including parsing,
 * updating, and validation.
 */
import * as fs from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { PlannerSprintStatusUpdaterService } from './planner-sprint-status-updater.service';
import { PlannerStoryEntry } from '../interfaces/planner-agent-execution.interfaces';

jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('PlannerSprintStatusUpdaterService', () => {
  let service: PlannerSprintStatusUpdaterService;

  const SAMPLE_SPRINT_STATUS = `# generated: 2026-01-29
development_status:
  # Epic 11
  epic-11: in-progress
  11-1: done
  11-2: done
  11-3: done

  # Epic 12
  epic-12: backlog
`;

  const sampleStories: PlannerStoryEntry[] = [
    {
      storyId: '12-1',
      title: 'Setup Foundation',
      epicId: 'epic-12',
      status: 'backlog',
      acceptanceCriteria: ['Given setup When running Then works'],
      estimatedComplexity: 'M',
    },
    {
      storyId: '12-2',
      title: 'Memory Service',
      epicId: 'epic-12',
      status: 'backlog',
      acceptanceCriteria: ['Given memory When stored Then retrieved'],
      estimatedComplexity: 'L',
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlannerSprintStatusUpdaterService],
    }).compile();

    service = module.get<PlannerSprintStatusUpdaterService>(
      PlannerSprintStatusUpdaterService,
    );

    jest.clearAllMocks();
  });

  // ─── updateSprintStatus ───────────────────────────────────────────────────

  describe('updateSprintStatus', () => {
    it('should add new stories to sprint-status.yaml', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(SAMPLE_SPRINT_STATUS);
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = await service.updateSprintStatus({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        stories: sampleStories,
      });

      expect(result.success).toBe(true);
      expect(result.storiesAdded).toBe(2);
      expect(result.storiesSkipped).toBe(0);
      expect(mockFs.writeFileSync).toHaveBeenCalled();

      // Verify written content includes new stories
      const writtenContent = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('12-1: backlog');
      expect(writtenContent).toContain('12-2: backlog');
    });

    it('should skip stories that already exist', async () => {
      const contentWithStory = SAMPLE_SPRINT_STATUS + '  12-1: done\n';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(contentWithStory);
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = await service.updateSprintStatus({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        stories: sampleStories,
      });

      expect(result.success).toBe(true);
      expect(result.storiesAdded).toBe(1); // Only 12-2 added
      expect(result.storiesSkipped).toBe(1); // 12-1 skipped
    });

    it('should set epic status to in-progress', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(SAMPLE_SPRINT_STATUS);
      mockFs.writeFileSync.mockImplementation(() => {});

      await service.updateSprintStatus({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        stories: sampleStories,
      });

      const writtenContent = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('epic-12: in-progress');
    });

    it('should create sprint-status.yaml if not exists', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.mkdirSync.mockImplementation(() => '' as any);

      const result = await service.updateSprintStatus({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        stories: sampleStories,
      });

      expect(result.success).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writtenContent = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('development_status:');
    });

    it('should preserve existing entries and comments', async () => {
      const existingContent = `# generated: 2026-01-29
development_status:
  # Epic 11
  epic-11: done
  11-1: done  # important comment
`;
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(existingContent);
      mockFs.writeFileSync.mockImplementation(() => {});

      await service.updateSprintStatus({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        stories: sampleStories,
      });

      const writtenContent = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('epic-11: done');
      expect(writtenContent).toContain('11-1: done  # important comment');
    });

    it('should return correct storiesAdded/skipped counts', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(SAMPLE_SPRINT_STATUS);
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = await service.updateSprintStatus({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        stories: sampleStories,
      });

      expect(result.storiesAdded).toBe(2);
      expect(result.storiesSkipped).toBe(0);
    });

    it('should handle all stories already existing', async () => {
      const contentWithAllStories =
        SAMPLE_SPRINT_STATUS + '  12-1: done\n  12-2: done\n';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(contentWithAllStories);

      const result = await service.updateSprintStatus({
        workspacePath: '/workspace',
        epicId: 'epic-12',
        stories: sampleStories,
      });

      expect(result.success).toBe(true);
      expect(result.storiesAdded).toBe(0);
      expect(result.storiesSkipped).toBe(2);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── parseSprintStatus ────────────────────────────────────────────────────

  describe('parseSprintStatus', () => {
    it('should parse epic and story statuses correctly', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(SAMPLE_SPRINT_STATUS);

      const result = await service.parseSprintStatus('/workspace');

      expect(result.epics.get('epic-11')).toBe('in-progress');
      expect(result.epics.get('epic-12')).toBe('backlog');
      expect(result.stories.get('11-1')).toBeDefined();
      expect(result.stories.get('11-1')?.status).toBe('done');
      expect(result.stories.get('11-2')?.status).toBe('done');
      expect(result.stories.get('11-3')?.status).toBe('done');
    });

    it('should handle missing file gracefully', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await service.parseSprintStatus('/workspace');

      expect(result.epics.size).toBe(0);
      expect(result.stories.size).toBe(0);
    });

    it('should handle malformed content gracefully', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const result = await service.parseSprintStatus('/workspace');

      expect(result.epics.size).toBe(0);
      expect(result.stories.size).toBe(0);
    });
  });

  // ─── validateSprintStatus ─────────────────────────────────────────────────

  describe('validateSprintStatus', () => {
    it('should return true for valid YAML', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(SAMPLE_SPRINT_STATUS);

      const isValid = await service.validateSprintStatus('/workspace');

      expect(isValid).toBe(true);
    });

    it('should return false for invalid content', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('just plain text without any colons or structure');

      const isValid = await service.validateSprintStatus('/workspace');

      expect(isValid).toBe(false);
    });

    it('should return false for missing file', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const isValid = await service.validateSprintStatus('/workspace');

      expect(isValid).toBe(false);
    });
  });
});
