/**
 * UpdateModelDefinitionDto
 *
 * Story 13-2: Model Registry
 *
 * DTO for updating a model definition. All fields optional.
 */
import { PartialType } from '@nestjs/mapped-types';
import { CreateModelDefinitionDto } from './create-model-definition.dto';

export class UpdateModelDefinitionDto extends PartialType(CreateModelDefinitionDto) {}
