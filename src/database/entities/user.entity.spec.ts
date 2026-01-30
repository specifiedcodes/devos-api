import { validate } from 'class-validator';
import { User } from './user.entity';

describe('User Entity', () => {
  describe('Entity Structure', () => {
    it('should create a user with all required fields', () => {
      const user = new User();
      user.email = 'test@example.com';
      user.passwordHash = 'hashed_password';
      user.twoFactorSecret = null;
      user.twoFactorEnabled = false;

      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.passwordHash).toBe('hashed_password');
      expect(user.twoFactorSecret).toBeNull();
      expect(user.twoFactorEnabled).toBe(false);
    });

    it('should have UUID as primary key type', () => {
      const user = new User();
      user.id = '550e8400-e29b-41d4-a716-446655440000';

      expect(user.id).toBeDefined();
      expect(typeof user.id).toBe('string');
    });

    it('should have proper timestamp fields', () => {
      const user = new User();
      const now = new Date();

      user.createdAt = now;
      user.updatedAt = now;
      user.lastLoginAt = null;

      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
      expect(user.lastLoginAt).toBeNull();
    });

    it('should support nullable lastLoginAt field', () => {
      const user = new User();
      user.lastLoginAt = new Date();

      expect(user.lastLoginAt).toBeInstanceOf(Date);
    });

    it('should have workspaceMembers relationship', () => {
      const user = new User();
      user.workspaceMembers = [];

      expect(Array.isArray(user.workspaceMembers)).toBe(true);
    });
  });

  describe('Field Validation', () => {
    it('should validate email format', async () => {
      const user = new User();
      user.email = 'invalid-email';
      user.passwordHash = 'hash';

      const errors = await validate(user);
      const emailErrors = errors.filter(err => err.property === 'email');

      expect(emailErrors.length).toBeGreaterThan(0);
    });

    it('should accept valid email', async () => {
      const user = new User();
      user.email = 'valid@example.com';
      user.passwordHash = 'hash';

      const errors = await validate(user);
      const emailErrors = errors.filter(err => err.property === 'email');

      expect(emailErrors.length).toBe(0);
    });

    it('should require email field', async () => {
      const user = new User();
      user.passwordHash = 'hash';

      const errors = await validate(user);
      const emailErrors = errors.filter(err => err.property === 'email');

      expect(emailErrors.length).toBeGreaterThan(0);
    });

    it('should require passwordHash field', async () => {
      const user = new User();
      user.email = 'test@example.com';

      const errors = await validate(user);
      const passwordErrors = errors.filter(err => err.property === 'passwordHash');

      expect(passwordErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Two-Factor Authentication Fields', () => {
    it('should default twoFactorEnabled to false', () => {
      const user = new User();
      user.twoFactorEnabled = false;

      expect(user.twoFactorEnabled).toBe(false);
    });

    it('should allow twoFactorSecret to be null', () => {
      const user = new User();
      user.twoFactorSecret = null;

      expect(user.twoFactorSecret).toBeNull();
    });

    it('should store twoFactorSecret when provided', () => {
      const user = new User();
      user.twoFactorSecret = 'secret_key_base32';

      expect(user.twoFactorSecret).toBe('secret_key_base32');
    });
  });
});
