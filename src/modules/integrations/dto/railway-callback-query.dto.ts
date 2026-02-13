import { IsString, IsNotEmpty } from 'class-validator';

export class RailwayCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;
}
