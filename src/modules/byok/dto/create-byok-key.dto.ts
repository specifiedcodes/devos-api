import { IsNotEmpty, IsString, IsEnum, MinLength } from 'class-validator';
import { KeyProvider } from '../../../database/entities/byok-key.entity';

export class CreateBYOKKeyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  keyName!: string;

  @IsEnum(KeyProvider)
  provider!: KeyProvider;

  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  apiKey!: string;
}
