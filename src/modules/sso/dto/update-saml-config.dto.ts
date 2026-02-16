import { PartialType } from '@nestjs/swagger';
import { CreateSamlConfigDto } from './create-saml-config.dto';

export class UpdateSamlConfigDto extends PartialType(CreateSamlConfigDto) {}
