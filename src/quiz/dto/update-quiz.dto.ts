import { PartialType } from '@nestjs/mapped-types';
import { CreateQuizDto } from './create-quiz.dto';
import { IsOptional, IsBoolean, IsString, IsArray } from 'class-validator';

/**
 * UpdateQuizDto provides flexible options for updating a quiz:
 * 
 * 1. Replace Mode (when existingUserIds is provided):
 *    - Replaces ALL user associations with the provided existingUserIds + any newly created users
 * 
 * 2. Additive Mode (when existingUserIds is NOT provided):
 *    - users: Creates new users and adds them to the quiz
 *    - addExistingUserIds: Adds existing users to the quiz
 *    - removeUserIds: Removes users (and their contestants) from the quiz
 */
export class UpdateQuizDto extends PartialType(CreateQuizDto) {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    winnerId?: string;

    /**
     * Add existing users to the quiz (additive operation)
     * Only used when existingUserIds is NOT provided
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    addExistingUserIds?: string[];

    /**
     * Remove users from the quiz (also removes their contestants)
     * Only used when existingUserIds is NOT provided
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    removeUserIds?: string[];
}
