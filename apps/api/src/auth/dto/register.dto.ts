import { Transform, type TransformFnParams } from 'class-transformer';

import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function normalizeEmailTransform(params: TransformFnParams): unknown {
  const value: unknown = params.value;

  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function normalizeNameTransform(params: TransformFnParams): unknown {
  const value: unknown = params.value;

  return typeof value === 'string' ? value.trim() : value;
}

export class RegisterDto {
  @Transform(normalizeEmailTransform)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @Transform(normalizeNameTransform)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
}
