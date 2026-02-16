/**
 * Email Notification DTOs
 * Story 16.6: Production Email Service (AC9)
 *
 * DTOs for email integration configuration and status endpoints.
 */

import {
  IsOptional,
  IsString,
  IsNumber,
  IsEmail,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfigureEmailDto {
  @IsIn(['smtp', 'sendgrid', 'ses'])
  @ApiProperty({
    description: 'Email provider type',
    enum: ['smtp', 'sendgrid', 'ses'],
    example: 'smtp',
  })
  provider!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'SMTP host', example: 'smtp.gmail.com' })
  smtpHost?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'SMTP port', example: 587 })
  smtpPort?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'SMTP username' })
  smtpUser?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'SMTP password (will be encrypted)' })
  smtpPass?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'API key for SendGrid/SES (will be encrypted)' })
  apiKey?: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional({ description: 'Sender email address', example: 'noreply@devos.app' })
  fromAddress?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Sender display name', example: 'DevOS' })
  fromName?: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional({ description: 'Reply-to email address', example: 'support@devos.app' })
  replyTo?: string;
}

export class UpdateEmailConfigDto {
  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional({ description: 'Sender email address' })
  fromAddress?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Sender display name' })
  fromName?: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional({ description: 'Reply-to email address' })
  replyTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  @ApiPropertyOptional({ description: 'Rate limit per hour (1-10000)', minimum: 1, maximum: 10000 })
  rateLimitPerHour?: number;
}

export class TestEmailDto {
  @IsEmail()
  @ApiProperty({ description: 'Email address to send test email to' })
  testEmail!: string;
}

export class EmailConfigurationStatusDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  provider!: string;

  @ApiProperty()
  fromAddress!: string;

  @ApiProperty()
  fromName!: string;

  @ApiProperty()
  replyTo!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  rateLimitPerHour!: number;

  @ApiProperty()
  totalSent!: number;

  @ApiProperty()
  totalBounced!: number;

  @ApiPropertyOptional()
  lastSentAt?: Date;

  @ApiProperty()
  createdAt!: Date;
}

export class EmailBounceDto {
  @ApiProperty()
  emailAddress!: string;

  @ApiProperty()
  bounceType!: string;

  @ApiPropertyOptional()
  bounceReason?: string;

  @ApiPropertyOptional()
  originalTemplate?: string;

  @ApiProperty()
  bouncedAt!: Date;
}

export class EmailSendLogDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  recipientEmail!: string;

  @ApiProperty()
  template!: string;

  @ApiProperty()
  subject!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  messageId?: string;

  @ApiPropertyOptional()
  errorMessage?: string;

  @ApiPropertyOptional()
  sentAt?: Date;

  @ApiProperty()
  createdAt!: Date;
}
