import { IsString, MinLength, MaxLength } from 'class-validator';

export class AskQuestionDto {
  @IsString()
  @MinLength(3, { message: 'Question must be at least 3 characters' })
  @MaxLength(500, { message: 'Question must not exceed 500 characters' })
  question: string;
}

export class QueryResponseDto {
  success: boolean;
  data?: any;
  message?: string;
  format?: 'text' | 'table';
  trace?: any[];
}

export class PlayerDto {
  name: string;
  format: string;
  matches: number;
  runs: number;
  average: number;
  strikeRate: number;
  highestScore: string;
  country: string;
}