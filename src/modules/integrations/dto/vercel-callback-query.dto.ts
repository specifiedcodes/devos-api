import { IsString, IsNotEmpty } from 'class-validator';

export class VercelCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;
}
