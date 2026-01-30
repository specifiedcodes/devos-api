import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('should validate correct email format', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'SecurePass123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject invalid email format', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'invalid-email',
      password: 'SecurePass123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('email');
    expect(errors[0].constraints).toHaveProperty('isEmail');
  });

  it('should require email field', async () => {
    const dto = plainToInstance(LoginDto, {
      password: 'SecurePass123!',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('email');
  });

  it('should require password field', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('password');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');
  });

  it('should trim and lowercase email', () => {
    const dto = plainToInstance(LoginDto, {
      email: '  USER@EXAMPLE.COM  ',
      password: 'SecurePass123!',
    });

    expect(dto.email).toBe('user@example.com');
  });

  it('should accept any non-empty password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'a', // Very short but non-empty
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject empty string password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: '',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('password');
  });
});
