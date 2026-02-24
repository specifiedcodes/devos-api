import { PartialType } from '@nestjs/swagger';
import { CreateCustomRoleDto } from './create-custom-role.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCustomRoleDto extends PartialType(CreateCustomRoleDto) {
  @ApiPropertyOptional({
    description: 'Whether the role is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
