/**
 * Publisher Reply DTOs
 *
 * Story 18-7: Agent Rating & Reviews
 *
 * DTOs for publisher replies to reviews.
 */
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PublisherReplyDto {
  @ApiProperty({ description: 'Reply text from the publisher', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reply!: string;
}
