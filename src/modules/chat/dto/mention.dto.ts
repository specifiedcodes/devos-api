import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  MaxLength,
  Matches,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Custom validator to ensure endIndex > startIndex
 * Story 9.4: Code Review Fix - Cross-field validation
 */
@ValidatorConstraint({ name: 'isEndIndexGreater', async: false })
export class IsEndIndexGreaterConstraint implements ValidatorConstraintInterface {
  validate(endIndex: number, args: ValidationArguments): boolean {
    const object = args.object as MentionDto;
    return typeof object.startIndex === 'number' && endIndex > object.startIndex;
  }

  defaultMessage(): string {
    return 'endIndex must be greater than startIndex';
  }
}

/**
 * DTO for a mention within a chat message
 * Story 9.4: @ Mention Agent Selection
 * Code Review Fix: Added sanitization, length limits, and cross-field validation
 */
export class MentionDto {
  @ApiProperty({
    description: 'UUID of the mentioned agent',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsNotEmpty()
  agentId!: string;

  @ApiProperty({
    description: 'Display name of the mentioned agent',
    example: 'Dev Agent',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9\s]+$/, {
    message: 'agentName must contain only alphanumeric characters and spaces',
  })
  agentName!: string;

  @ApiProperty({
    description: 'Start index of the mention in the message text',
    example: 0,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  startIndex!: number;

  @ApiProperty({
    description: 'End index of the mention in the message text',
    example: 10,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  @Validate(IsEndIndexGreaterConstraint)
  endIndex!: number;
}
