import { PartialType } from '@nestjs/mapped-types';
import { CreateQuizDto } from './create-quiz.dto';
import { IsOptional, IsBoolean, IsString } from 'class-validator';

export class UpdateQuizDto extends PartialType(CreateQuizDto) {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    winnerId?: string;
}
