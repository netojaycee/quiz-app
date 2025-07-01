import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsInt, Min, IsIn, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoundDto {
    @IsInt()
    @Min(1)
    roundNumber: number;

    @IsString()
    @IsIn(['multiple_choice', 'yes_no', 'simultaneous'])
    quizType: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    timePerQuestion?: number;
}

export class CreateContestantDto {
    @IsString()
    @IsNotEmpty()
    name: string; // Contestant's name (e.g., "John", "Peace")

    @IsOptional()
    @IsString()
    location?: string; // Optional location (e.g., "Lagos", "Kogi")
}

export class CreateQuizDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateRoundDto)
    @ArrayMinSize(1)
    rounds: CreateRoundDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateContestantDto)
    contestants?: CreateContestantDto[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    userIds?: string[]; // Users to associate with this quiz
}
