import { IsString, IsInt, IsArray, IsEnum, IsOptional, Min, Max, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Transform } from 'class-transformer';
import { Difficulty, QuestionType } from '@prisma/client';



export class CreateQuestionDto {
    @IsString()
    questionText: string;

    @IsEnum(QuestionType)
    questionType: QuestionType;

    @IsArray()
    @ArrayMinSize(2)
    @ArrayMaxSize(4)
    options: string[];

    @IsInt()
    @Min(0)
    @Transform(({ value }) => parseInt(value))
    correctAnswerIndex: number;

    @IsOptional()
    @IsEnum(Difficulty)
    difficulty?: Difficulty = Difficulty.medium;
}

export class BulkCreateQuestionsDto {
    @IsArray()
    @ArrayMinSize(1)
    questions: CreateQuestionDto[];
}
