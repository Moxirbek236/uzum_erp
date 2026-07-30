import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier: string; // Can be phone or email

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
