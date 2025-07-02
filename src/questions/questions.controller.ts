import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
    UploadedFile,
    UseInterceptors,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto, BulkCreateQuestionsDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { QuestionType, User } from '@prisma/client';

@Controller('questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionsController {
    constructor(private readonly questionsService: QuestionsService) { }

    /**
     * Create a single question for a quiz
     * Only moderators can create questions
     */
    @Post(':quizId')
    @Roles('MODERATOR')
    async create(
        @Param('quizId') quizId: string,
        @Body() createQuestionDto: CreateQuestionDto,
        @GetUser() user: User,
    ) {
        return this.questionsService.create(quizId, createQuestionDto);
    }

    /**
     * Bulk create questions for a quiz
     * Only moderators can create questions
     */
    @Post(':quizId/bulk')
    @Roles('MODERATOR')
    async createBulk(
        @Param('quizId') quizId: string,
        @Body() bulkCreateDto: BulkCreateQuestionsDto,
        @GetUser() user: User,
    ) {
        return this.questionsService.createBulk(quizId, bulkCreateDto);
    }

    /**
     * Upload questions from CSV or Excel file
     * Only moderators can upload questions
     */
    @Post(':quizId/upload')
    @Roles('MODERATOR')
    @UseInterceptors(FileInterceptor('file'))
    async uploadQuestions(
        @Param('quizId') quizId: string,
        @UploadedFile() file: any,
        @GetUser() user: User,
    ) {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        const fileType = this.getFileType(file.originalname);
        if (!fileType) {
            throw new BadRequestException('Only CSV and Excel files are supported');
        }

        return this.questionsService.uploadFromFile(quizId, file.buffer, fileType);
    }

    /**
     * Get all questions for a quiz with optional filtering
     */
    @Get(':quizId')
    async findAll(
        @Param('quizId') quizId: string,
        @Query('questionType') questionType?: QuestionType,
        @Query('isAnswered') isAnswered?: string,
        @Query('difficulty') difficulty?: string,
        @GetUser() user?: User,
    ) {
        const filters = {
            questionType,
            isAnswered: isAnswered ? isAnswered === 'true' : undefined,
            difficulty,
        };

        return this.questionsService.findAll(quizId, filters);
    }

    /**
     * Get questions suitable for a specific round type
     */
    @Get(':quizId/round/:roundType')
    async getQuestionsForRound(
        @Param('quizId') quizId: string,
        @Param('roundType') roundType: string,
        @Query('limit') limit?: string,
        @GetUser() user?: User,
    ) {
        const questionLimit = limit ? parseInt(limit) : undefined;
        return this.questionsService.getQuestionsForRound(quizId, roundType, questionLimit);
    }

    /**
     * Get question statistics for a quiz
     */
    @Get(':quizId/stats')
    async getQuestionStats(
        @Param('quizId') quizId: string,
        @GetUser() user?: User,
    ) {
        return this.questionsService.getQuestionStats(quizId);
    }

    /**
     * Get question requirements for a quiz
     * Shows how many questions are needed vs available
     */
    @Get(':quizId/requirements')
    async getQuestionRequirements(
        @Param('quizId') quizId: string,
        @GetUser() user?: User,
    ) {
        return this.questionsService.getQuestionRequirements(quizId);
    }

    /**
     * Update a specific question
     * Only moderators can update questions
     */
    @Patch(':quizId/:questionId')
    @Roles('MODERATOR')
    async update(
        @Param('quizId') quizId: string,
        @Param('questionId') questionId: string,
        @Body() updateQuestionDto: UpdateQuestionDto,
        @GetUser() user: User,
    ) {
        return this.questionsService.update(quizId, questionId, updateQuestionDto);
    }

    /**
     * Delete a specific question
     * Only moderators can delete questions
     */
    @Delete(':quizId/:questionId')
    @Roles('MODERATOR')
    async remove(
        @Param('quizId') quizId: string,
        @Param('questionId') questionId: string,
        @GetUser() user: User,
    ) {
        await this.questionsService.remove(quizId, questionId);
        return { message: 'Question deleted successfully' };
    }

    /**
     * Reset all questions in a quiz (mark as unanswered)
     * Only moderators can reset questions
     */
    @Post(':quizId/reset')
    @Roles('MODERATOR')
    async resetQuizQuestions(
        @Param('quizId') quizId: string,
        @GetUser() user: User,
    ) {
        await this.questionsService.resetQuizQuestions(quizId);
        return { message: 'All questions reset successfully' };
    }

    /**
     * Mark a question as answered
     * This is typically called internally during quiz flow
     */
    @Post(':quizId/:questionId/mark-answered')
    @Roles('MODERATOR')
    async markAsAnswered(
        @Param('quizId') quizId: string,
        @Param('questionId') questionId: string,
        @GetUser() user: User,
    ) {
        await this.questionsService.markAsAnswered(questionId);
        return { message: 'Question marked as answered' };
    }

    private getFileType(filename: string): 'csv' | 'xlsx' | null {
        const extension = filename.toLowerCase().split('.').pop();
        if (extension === 'csv') return 'csv';
        if (extension === 'xlsx' || extension === 'xls') return 'xlsx';
        return null;
    }
}
