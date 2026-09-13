import { Transform, type TransformFnParams } from 'class-transformer';

import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

function normalizeEmailTransform(params: TransformFnParams): unknown {
  const value: unknown = params.value;

  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class LoginDto {
  @Transform(normalizeEmailTransform)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
