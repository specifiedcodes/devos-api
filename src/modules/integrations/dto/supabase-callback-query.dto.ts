import { IsString, IsNotEmpty } from 'class-validator';

export class SupabaseCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;
}
