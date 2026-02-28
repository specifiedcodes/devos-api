import { IsString, Length, Matches, IsUrl, MaxLength } from 'class-validator';

export class CustomLinkDto {
  @IsString()
  @Length(1, 100)
  @Matches(/^[^<>&"']+$/, { message: 'Link text must not contain HTML special characters' })
  text!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  url!: string;
}
