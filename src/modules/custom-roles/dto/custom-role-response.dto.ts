import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseRole } from '../../../database/entities/custom-role.entity';

export class CustomRoleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() color!: string;
  @ApiProperty() icon!: string;
  @ApiPropertyOptional({ enum: BaseRole }) baseRole!: BaseRole | null;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() priority!: number;
  @ApiProperty() memberCount!: number;
  @ApiProperty() createdBy!: string;
  @ApiPropertyOptional() creatorName?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
