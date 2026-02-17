import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateAgentDefinitionDto } from './create-agent-definition.dto';

export class UpdateAgentDefinitionDto extends PartialType(
  OmitType(CreateAgentDefinitionDto, ['name'] as const),
) {}
