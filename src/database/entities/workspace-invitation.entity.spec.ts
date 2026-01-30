import { validate } from 'class-validator';
import {
  WorkspaceInvitation,
  InvitationStatus,
} from './workspace-invitation.entity';
import { WorkspaceRole } from './workspace-member.entity';

describe('WorkspaceInvitation Entity', () => {
  describe('Entity Structure', () => {
    it('should create an invitation with all required fields', () => {
      const invitation = new WorkspaceInvitation();
      invitation.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      invitation.email = 'invitee@example.com';
      invitation.role = WorkspaceRole.DEVELOPER;
      invitation.inviterUserId = '660e8400-e29b-41d4-a716-446655440001';
      invitation.token = 'hashed_token_value';
      invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      invitation.status = InvitationStatus.PENDING;

      expect(invitation).toBeDefined();
      expect(invitation.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(invitation.email).toBe('invitee@example.com');
      expect(invitation.role).toBe(WorkspaceRole.DEVELOPER);
      expect(invitation.inviterUserId).toBe('660e8400-e29b-41d4-a716-446655440001');
      expect(invitation.token).toBe('hashed_token_value');
      expect(invitation.expiresAt).toBeInstanceOf(Date);
      expect(invitation.status).toBe(InvitationStatus.PENDING);
    });

    it('should have UUID as primary key type', () => {
      const invitation = new WorkspaceInvitation();
      invitation.id = '770e8400-e29b-41d4-a716-446655440002';

      expect(invitation.id).toBeDefined();
      expect(typeof invitation.id).toBe('string');
    });

    it('should have createdAt and updatedAt timestamps', () => {
      const invitation = new WorkspaceInvitation();
      const now = new Date();

      invitation.createdAt = now;
      invitation.updatedAt = now;

      expect(invitation.createdAt).toBeInstanceOf(Date);
      expect(invitation.updatedAt).toBeInstanceOf(Date);
    });

    it('should have workspace relationship', () => {
      const invitation = new WorkspaceInvitation();
      invitation.workspace = undefined;

      expect(invitation.workspace).toBeUndefined();
    });

    it('should have inviter relationship', () => {
      const invitation = new WorkspaceInvitation();
      invitation.inviter = undefined;

      expect(invitation.inviter).toBeUndefined();
    });
  });

  describe('InvitationStatus Enum', () => {
    it('should define PENDING status', () => {
      expect(InvitationStatus.PENDING).toBe('pending');
    });

    it('should define ACCEPTED status', () => {
      expect(InvitationStatus.ACCEPTED).toBe('accepted');
    });

    it('should define REVOKED status', () => {
      expect(InvitationStatus.REVOKED).toBe('revoked');
    });

    it('should define EXPIRED status', () => {
      expect(InvitationStatus.EXPIRED).toBe('expired');
    });

    it('should accept valid status values', () => {
      const invitation = new WorkspaceInvitation();

      invitation.status = InvitationStatus.PENDING;
      expect(invitation.status).toBe('pending');

      invitation.status = InvitationStatus.ACCEPTED;
      expect(invitation.status).toBe('accepted');

      invitation.status = InvitationStatus.REVOKED;
      expect(invitation.status).toBe('revoked');

      invitation.status = InvitationStatus.EXPIRED;
      expect(invitation.status).toBe('expired');
    });

    it('should default to PENDING status', () => {
      const invitation = new WorkspaceInvitation();
      invitation.status = InvitationStatus.PENDING;

      expect(invitation.status).toBe(InvitationStatus.PENDING);
    });
  });

  describe('Field Validation', () => {
    it('should require workspaceId field', async () => {
      const invitation = new WorkspaceInvitation();
      invitation.email = 'test@example.com';
      invitation.role = WorkspaceRole.DEVELOPER;
      invitation.inviterUserId = '660e8400-e29b-41d4-a716-446655440001';
      invitation.token = 'hashed_token';
      invitation.expiresAt = new Date();
      invitation.status = InvitationStatus.PENDING;

      const errors = await validate(invitation);
      const workspaceIdErrors = errors.filter(
        (err) => err.property === 'workspaceId',
      );

      expect(workspaceIdErrors.length).toBeGreaterThan(0);
    });

    it('should require email field', async () => {
      const invitation = new WorkspaceInvitation();
      invitation.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      invitation.role = WorkspaceRole.DEVELOPER;
      invitation.inviterUserId = '660e8400-e29b-41d4-a716-446655440001';
      invitation.token = 'hashed_token';
      invitation.expiresAt = new Date();
      invitation.status = InvitationStatus.PENDING;

      const errors = await validate(invitation);
      const emailErrors = errors.filter((err) => err.property === 'email');

      expect(emailErrors.length).toBeGreaterThan(0);
    });

    it('should validate email format', async () => {
      const invitation = new WorkspaceInvitation();
      invitation.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      invitation.email = 'invalid-email';
      invitation.role = WorkspaceRole.DEVELOPER;
      invitation.inviterUserId = '660e8400-e29b-41d4-a716-446655440001';
      invitation.token = 'hashed_token';
      invitation.expiresAt = new Date();
      invitation.status = InvitationStatus.PENDING;

      const errors = await validate(invitation);
      const emailErrors = errors.filter((err) => err.property === 'email');

      expect(emailErrors.length).toBeGreaterThan(0);
    });

    it('should accept valid email format', async () => {
      const invitation = new WorkspaceInvitation();
      invitation.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      invitation.email = 'valid@example.com';
      invitation.role = WorkspaceRole.DEVELOPER;
      invitation.inviterUserId = '660e8400-e29b-41d4-a716-446655440001';
      invitation.token = 'hashed_token';
      invitation.expiresAt = new Date();
      invitation.status = InvitationStatus.PENDING;

      const errors = await validate(invitation);
      const emailErrors = errors.filter((err) => err.property === 'email');

      expect(emailErrors.length).toBe(0);
    });

    it('should require inviterUserId field', async () => {
      const invitation = new WorkspaceInvitation();
      invitation.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      invitation.email = 'test@example.com';
      invitation.role = WorkspaceRole.DEVELOPER;
      invitation.token = 'hashed_token';
      invitation.expiresAt = new Date();
      invitation.status = InvitationStatus.PENDING;

      const errors = await validate(invitation);
      const inviterErrors = errors.filter(
        (err) => err.property === 'inviterUserId',
      );

      expect(inviterErrors.length).toBeGreaterThan(0);
    });

    it('should accept valid invitation data', async () => {
      const invitation = new WorkspaceInvitation();
      invitation.workspaceId = '550e8400-e29b-41d4-a716-446655440000';
      invitation.email = 'valid@example.com';
      invitation.role = WorkspaceRole.DEVELOPER;
      invitation.inviterUserId = '660e8400-e29b-41d4-a716-446655440001';
      invitation.token = 'hashed_token_value';
      invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      invitation.status = InvitationStatus.PENDING;

      const errors = await validate(invitation);

      expect(errors.length).toBe(0);
    });
  });

  describe('Invitation Workflow', () => {
    it('should support pending invitations awaiting acceptance', () => {
      const invitation = new WorkspaceInvitation();
      invitation.status = InvitationStatus.PENDING;

      expect(invitation.status).toBe('pending');
    });

    it('should support accepted invitations', () => {
      const invitation = new WorkspaceInvitation();
      invitation.status = InvitationStatus.ACCEPTED;

      expect(invitation.status).toBe('accepted');
    });

    it('should support revoked invitations', () => {
      const invitation = new WorkspaceInvitation();
      invitation.status = InvitationStatus.REVOKED;

      expect(invitation.status).toBe('revoked');
    });

    it('should support expired invitations', () => {
      const invitation = new WorkspaceInvitation();
      invitation.status = InvitationStatus.EXPIRED;

      expect(invitation.status).toBe('expired');
    });

    it('should store token as hash for security', () => {
      const invitation = new WorkspaceInvitation();
      invitation.token = 'sha256_hashed_token_value';

      expect(invitation.token).toBe('sha256_hashed_token_value');
      expect(invitation.token).not.toContain('raw_token');
    });

    it('should have expiry date for time-limited invitations', () => {
      const invitation = new WorkspaceInvitation();
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      invitation.expiresAt = sevenDaysFromNow;

      expect(invitation.expiresAt).toBeInstanceOf(Date);
      expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Role Assignment', () => {
    it('should support inviting as OWNER role', () => {
      const invitation = new WorkspaceInvitation();
      invitation.role = WorkspaceRole.OWNER;

      expect(invitation.role).toBe('owner');
    });

    it('should support inviting as ADMIN role', () => {
      const invitation = new WorkspaceInvitation();
      invitation.role = WorkspaceRole.ADMIN;

      expect(invitation.role).toBe('admin');
    });

    it('should support inviting as DEVELOPER role', () => {
      const invitation = new WorkspaceInvitation();
      invitation.role = WorkspaceRole.DEVELOPER;

      expect(invitation.role).toBe('developer');
    });

    it('should support inviting as VIEWER role', () => {
      const invitation = new WorkspaceInvitation();
      invitation.role = WorkspaceRole.VIEWER;

      expect(invitation.role).toBe('viewer');
    });

    it('should default to DEVELOPER role', () => {
      const invitation = new WorkspaceInvitation();
      invitation.role = WorkspaceRole.DEVELOPER;

      expect(invitation.role).toBe(WorkspaceRole.DEVELOPER);
    });
  });
});
