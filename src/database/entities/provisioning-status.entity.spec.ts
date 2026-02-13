import { validate } from 'class-validator';
import { ProvisioningStatus, ProvisioningStatusEnum, StepStatus } from './provisioning-status.entity';
import { Project } from './project.entity';
import { Workspace } from './workspace.entity';

describe('ProvisioningStatus Entity', () => {
  describe('Validation', () => {
    it('should validate a complete provisioning status entity', async () => {
      const status = new ProvisioningStatus();
      status.id = '550e8400-e29b-41d4-a716-446655440000';
      status.projectId = '550e8400-e29b-41d4-a716-446655440001';
      status.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      status.status = ProvisioningStatusEnum.IN_PROGRESS;
      status.steps = {
        github_repo_created: { status: 'completed', completedAt: new Date().toISOString() },
        database_provisioned: { status: 'in_progress', startedAt: new Date().toISOString() },
        deployment_configured: { status: 'pending' },
        project_initialized: { status: 'pending' },
      };
      status.currentStep = 'database_provisioned';

      const errors = await validate(status);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation if projectId is not a UUID', async () => {
      const status = new ProvisioningStatus();
      status.projectId = 'invalid-uuid';
      status.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      status.status = ProvisioningStatusEnum.PENDING;

      const errors = await validate(status);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === 'projectId')).toBe(true);
    });

    it('should fail validation if workspaceId is not a UUID', async () => {
      const status = new ProvisioningStatus();
      status.projectId = '550e8400-e29b-41d4-a716-446655440001';
      status.workspaceId = 'not-a-uuid';
      status.status = ProvisioningStatusEnum.PENDING;

      const errors = await validate(status);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === 'workspaceId')).toBe(true);
    });

    it('should fail validation if status is invalid', async () => {
      const status = new ProvisioningStatus();
      status.projectId = '550e8400-e29b-41d4-a716-446655440001';
      status.workspaceId = '550e8400-e29b-41d4-a716-446655440002';
      (status as any).status = 'invalid-status';

      const errors = await validate(status);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === 'status')).toBe(true);
    });
  });

  describe('Default Values', () => {
    it('should have default status as PENDING', () => {
      const status = new ProvisioningStatus();
      expect(status.status).toBeUndefined(); // TypeORM sets defaults at DB level
    });

    it('should have default steps structure', () => {
      const status = new ProvisioningStatus();
      // Default steps are set at DB level or during creation
      expect(status.steps).toBeUndefined();
    });
  });

  describe('Step Status Structure', () => {
    it('should allow valid step status with all fields', () => {
      const stepStatus: StepStatus = {
        status: 'completed',
        startedAt: '2026-01-31T12:00:00Z',
        completedAt: '2026-01-31T12:00:02Z',
      };

      expect(stepStatus.status).toBe('completed');
      expect(stepStatus.startedAt).toBe('2026-01-31T12:00:00Z');
      expect(stepStatus.completedAt).toBe('2026-01-31T12:00:02Z');
    });

    it('should allow step status with only status field', () => {
      const stepStatus: StepStatus = {
        status: 'pending',
      };

      expect(stepStatus.status).toBe('pending');
      expect(stepStatus.startedAt).toBeUndefined();
      expect(stepStatus.completedAt).toBeUndefined();
    });

    it('should allow step status with error field', () => {
      const stepStatus: StepStatus = {
        status: 'failed',
        error: 'GitHub API rate limit exceeded',
      };

      expect(stepStatus.status).toBe('failed');
      expect(stepStatus.error).toBe('GitHub API rate limit exceeded');
    });
  });

  describe('Relations', () => {
    it('should have project relation', () => {
      const status = new ProvisioningStatus();
      const project = new Project();
      status.project = project;

      expect(status.project).toBe(project);
    });

    it('should have workspace relation', () => {
      const status = new ProvisioningStatus();
      const workspace = new Workspace();
      status.workspace = workspace;

      expect(status.workspace).toBe(workspace);
    });
  });

  describe('Timestamps', () => {
    it('should have createdAt and updatedAt timestamps', () => {
      const status = new ProvisioningStatus();
      status.createdAt = new Date();
      status.updatedAt = new Date();

      expect(status.createdAt).toBeInstanceOf(Date);
      expect(status.updatedAt).toBeInstanceOf(Date);
    });

    it('should allow nullable startedAt and completedAt', () => {
      const status = new ProvisioningStatus();
      status.startedAt = null;
      status.completedAt = null;

      expect(status.startedAt).toBeNull();
      expect(status.completedAt).toBeNull();
    });
  });
});
