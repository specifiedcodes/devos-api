import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderRolesDto {
  @ApiProperty({
    description: 'Ordered array of role IDs',
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  roleIds!: string[];
}
