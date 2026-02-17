import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AgentDefinitionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty() version!: string;
  @ApiProperty() schemaVersion!: string;
  @ApiProperty({ description: 'Full agent definition spec' }) definition!: Record<string, unknown>;
  @ApiProperty() icon!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() isPublished!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdBy!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class AgentDefinitionValidationResponseDto {
  @ApiProperty() valid!: boolean;
  @ApiProperty({ description: 'Validation errors', type: 'array' }) errors!: Array<{
    path: string;
    message: string;
    keyword: string;
  }>;
  @ApiProperty({ description: 'Validation warnings', type: 'array' }) warnings!: Array<{
    path: string;
    message: string;
    type: string;
  }>;
}
