import { PartialType } from '@nestjs/swagger';
import { CreateOidcConfigDto } from './create-oidc-config.dto';

export class UpdateOidcConfigDto extends PartialType(CreateOidcConfigDto) {}
