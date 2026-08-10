import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SearchStudyPackDto {
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
}
