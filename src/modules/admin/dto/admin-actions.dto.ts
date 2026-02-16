import { IsString, MinLength, MaxLength, IsOptional, IsBoolean } from 'class-validator';

export class SuspendUserDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class DeleteUserDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  permanent?: boolean = false;
}
