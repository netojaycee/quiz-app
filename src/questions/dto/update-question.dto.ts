import { PartialType } from '@nestjs/mapped-types';
import { CreateQuestionDto } from './create-question.dto';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateQuestionDto extends PartialType(CreateQuestionDto) {
    @IsOptional()
    @IsBoolean()
    isAnswered?: boolean;
}
