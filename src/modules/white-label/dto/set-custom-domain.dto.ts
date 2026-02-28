/**
 * Set Custom Domain DTO
 * Story 22-1: White-Label Configuration (AC2)
 *
 * Validates custom domain configuration requests.
 */

import { IsString, Length, Matches } from 'class-validator';

export class SetCustomDomainDto {
  @IsString()
  @Length(4, 253)
  @Matches(/^(?!-)([a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,}$/, {
    message: 'Invalid domain format',
  })
  domain!: string;
}
