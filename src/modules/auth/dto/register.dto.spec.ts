import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  describe('email validation', () => {
    it('should validate correct email format', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'SecurePass123!';
      dto.passwordConfirmation = 'SecurePass123!';

      const errors = await validate(dto);
      const emailErrors = errors.filter((e) => e.property === 'email');

      expect(emailErrors).toHaveLength(0);
    });

    it('should reject invalid email format', async () => {
      const dto = new RegisterDto();
      dto.email = 'invalid-email';
      dto.password = 'SecurePass123!';
      dto.passwordConfirmation = 'SecurePass123!';

      const errors = await validate(dto);
      const emailErrors = errors.filter((e) => e.property === 'email');

      expect(emailErrors.length).toBeGreaterThan(0);
      expect(emailErrors[0].constraints).toHaveProperty('isEmail');
    });

    it('should reject email without domain', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@';
      dto.password = 'SecurePass123!';
      dto.passwordConfirmation = 'SecurePass123!';

      const errors = await validate(dto);
      const emailErrors = errors.filter((e) => e.property === 'email');

      expect(emailErrors.length).toBeGreaterThan(0);
    });

    it('should reject email without @ symbol', async () => {
      const dto = new RegisterDto();
      dto.email = 'userexample.com';
      dto.password = 'SecurePass123!';
      dto.passwordConfirmation = 'SecurePass123!';

      const errors = await validate(dto);
      const emailErrors = errors.filter((e) => e.property === 'email');

      expect(emailErrors.length).toBeGreaterThan(0);
    });
  });

  describe('password validation', () => {
    it('should validate password minimum length (8 chars)', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'Short1!';
      dto.passwordConfirmation = 'Short1!';

      const errors = await validate(dto);
      const passwordErrors = errors.filter((e) => e.property === 'password');

      expect(passwordErrors.length).toBeGreaterThan(0);
      expect(passwordErrors[0].constraints).toHaveProperty('minLength');
    });

    it('should validate password has uppercase letter', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'lowercase123';
      dto.passwordConfirmation = 'lowercase123';

      const errors = await validate(dto);
      const passwordErrors = errors.filter((e) => e.property === 'password');

      expect(passwordErrors.length).toBeGreaterThan(0);
      expect(passwordErrors[0].constraints).toHaveProperty('matches');
    });

    it('should validate password has lowercase letter', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'UPPERCASE123';
      dto.passwordConfirmation = 'UPPERCASE123';

      const errors = await validate(dto);
      const passwordErrors = errors.filter((e) => e.property === 'password');

      expect(passwordErrors.length).toBeGreaterThan(0);
      expect(passwordErrors[0].constraints).toHaveProperty('matches');
    });

    it('should validate password has number', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'NoNumbers!';
      dto.passwordConfirmation = 'NoNumbers!';

      const errors = await validate(dto);
      const passwordErrors = errors.filter((e) => e.property === 'password');

      expect(passwordErrors.length).toBeGreaterThan(0);
      expect(passwordErrors[0].constraints).toHaveProperty('matches');
    });

    it('should accept password with special characters (optional)', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'SecurePass123!@#';
      dto.passwordConfirmation = 'SecurePass123!@#';

      const errors = await validate(dto);
      const passwordErrors = errors.filter((e) => e.property === 'password');

      expect(passwordErrors).toHaveLength(0);
    });

    it('should accept valid password without special characters', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'SecurePass123';
      dto.passwordConfirmation = 'SecurePass123';

      const errors = await validate(dto);
      const passwordErrors = errors.filter((e) => e.property === 'password');

      expect(passwordErrors).toHaveLength(0);
    });
  });

  describe('password confirmation validation', () => {
    it('should require password confirmation', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'SecurePass123!';
      // passwordConfirmation is undefined

      const errors = await validate(dto);
      const confirmationErrors = errors.filter(
        (e) => e.property === 'passwordConfirmation',
      );

      expect(confirmationErrors.length).toBeGreaterThan(0);
    });

    it('should accept when password confirmation is provided', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'SecurePass123!';
      dto.passwordConfirmation = 'SecurePass123!';

      const errors = await validate(dto);
      const confirmationErrors = errors.filter(
        (e) => e.property === 'passwordConfirmation',
      );

      expect(confirmationErrors).toHaveLength(0);
    });

    it('should reject when password confirmation does not match', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'SecurePass123!';
      dto.passwordConfirmation = 'DifferentPass456!';

      const errors = await validate(dto);
      const confirmationErrors = errors.filter(
        (e) => e.property === 'passwordConfirmation',
      );

      expect(confirmationErrors.length).toBeGreaterThan(0);
      expect(confirmationErrors[0].constraints).toHaveProperty('match');
    });
  });

  describe('complete validation', () => {
    it('should pass validation with all valid fields', async () => {
      const dto = new RegisterDto();
      dto.email = 'user@example.com';
      dto.password = 'SecurePass123!';
      dto.passwordConfirmation = 'SecurePass123!';

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });
});
