import { PartialType } from '@nestjs/swagger';
import { CreateProjectPreferencesDto } from './create-project-preferences.dto';

export class UpdateProjectPreferencesDto extends PartialType(
  CreateProjectPreferencesDto,
) {}
