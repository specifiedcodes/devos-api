import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Match } from '../../../common/validators/match.validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address (RFC 5322 format)',
  })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Password (min 8 chars, 1 uppercase, 1 lowercase, 1 number)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least 1 uppercase, 1 lowercase, and 1 number',
  })
  password!: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Password confirmation (must match password)',
  })
  @IsString()
  @Match('password', { message: 'Password confirmation must match password' })
  passwordConfirmation!: string;
}
