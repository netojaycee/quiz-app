import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsInt, Min, IsIn, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { QuizType } from '@prisma/client';

export class CreateRoundDto {
    @IsInt()
    @Min(1)
    roundNumber: number;

    @IsString()
    @IsIn(['multiple_choice', 'yes_no', 'simultaneous'])
    quizType: QuizType;

    @IsOptional()
    @IsInt()
    @Min(1)
    timePerQuestion?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    questionsPerParticipant?: number = 3; // Default to 3 questions per participant
}

export class CreateContestantDto {
    @IsString()
    @IsNotEmpty()
    name: string; // Contestant's name (e.g., "John", "Joy")

    @IsOptional()
    @IsString()
    location?: string; // Contestant's location (e.g., "Kano", "Jos")
}

export class CreateUserWithContestantsDto {
    @IsString()
    @IsNotEmpty()
    username: string; // User/team username (e.g., "lagos", "jos")

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateContestantDto)
    @ArrayMinSize(1)
    contestants: CreateContestantDto[]; // Contestants belonging to this user
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

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateUserWithContestantsDto)
    @ArrayMinSize(1)
    users: CreateUserWithContestantsDto[]; // Users with their contestants

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    existingUserIds?: string[]; // Existing users to associate with this quiz
}
