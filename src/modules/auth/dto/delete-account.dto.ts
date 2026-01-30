import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiProperty({ description: 'Password for account deletion verification' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
