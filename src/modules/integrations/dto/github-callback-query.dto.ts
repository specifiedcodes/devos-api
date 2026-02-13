import { IsString, IsNotEmpty } from 'class-validator';

export class GitHubCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;
}
