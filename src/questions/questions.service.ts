import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto, BulkCreateQuestionsDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionResponseDto, QuestionStatsDto, QuestionRequirementsDto } from './dto/question-response.dto';
import { QuizType, Difficulty, QuestionType as PrismaQuestionType, QuestionType } from '@prisma/client';
import * as csvParser from 'csv-parser';
import * as xlsx from 'xlsx';
import { Readable } from 'stream';

@Injectable()
export class QuestionsService {
    constructor(private prisma: PrismaService) { }

    /**
     * Create a single question for a quiz
     */
    async create(quizId: string, createQuestionDto: CreateQuestionDto): Promise<QuestionResponseDto> {
        // Validate quiz exists
        const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
        if (!quiz) {
            throw new NotFoundException('Quiz not found');
        }

        // Validate options based on question type
        this.validateQuestionOptions(createQuestionDto);

        // Get next question number
        const lastQuestion = await this.prisma.question.findFirst({
            where: { quizId },
            orderBy: { questionNumber: 'desc' },
            select: { questionNumber: true }
        });

        const questionNumber = (lastQuestion?.questionNumber || 0) + 1;

        const question = await this.prisma.question.create({
            data: {
                quizId,
                questionNumber,
                questionText: createQuestionDto.questionText,
                questionType: this.mapQuestionTypeToEnum(createQuestionDto.questionType),
                options: createQuestionDto.options,
                correctAnswerIndex: createQuestionDto.correctAnswerIndex,
                difficulty: createQuestionDto.difficulty as Difficulty,
            }
        });

        return this.mapToResponseDto(question);
    }

    /**
     * Bulk create questions from array
     */
    async createBulk(quizId: string, bulkCreateDto: BulkCreateQuestionsDto): Promise<QuestionResponseDto[]> {
        // Validate quiz exists
        const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
        if (!quiz) {
            throw new NotFoundException('Quiz not found');
        }

        // Validate all questions
        bulkCreateDto.questions.forEach(question => {
            this.validateQuestionOptions(question);
        });

        // Get starting question number
        const lastQuestion = await this.prisma.question.findFirst({
            where: { quizId },
            orderBy: { questionNumber: 'desc' },
            select: { questionNumber: true }
        });

        let currentQuestionNumber = (lastQuestion?.questionNumber || 0) + 1;

        // Create questions in transaction
        const createdQuestions = await this.prisma.$transaction(
            bulkCreateDto.questions.map(questionDto =>
                this.prisma.question.create({
                    data: {
                        quizId,
                        questionNumber: currentQuestionNumber++,
                        questionText: questionDto.questionText,
                        questionType: this.mapQuestionTypeToEnum(questionDto.questionType),
                        options: questionDto.options,
                        correctAnswerIndex: questionDto.correctAnswerIndex,
                        difficulty: questionDto.difficulty as Difficulty,
                    }
                })
            )
        );

        return createdQuestions.map(question => this.mapToResponseDto(question));
    }

    /**
     * Upload questions from CSV/Excel file
     */
    async uploadFromFile(quizId: string, fileBuffer: Buffer, fileType: 'csv' | 'xlsx'): Promise<QuestionResponseDto[]> {
        let questionsData: any[];

        if (fileType === 'csv') {
            questionsData = await this.parseCsvFile(fileBuffer);
        } else if (fileType === 'xlsx') {
            questionsData = await this.parseExcelFile(fileBuffer);
        } else {
            throw new BadRequestException('Unsupported file type. Only CSV and Excel files are allowed.');
        }

        // Transform and validate data
        const questions: CreateQuestionDto[] = questionsData.map((row, index) => {
            try {
                return this.transformFileRowToDto(row);
            } catch (error) {
                throw new BadRequestException(`Error in row ${index + 1}: ${error.message}`);
            }
        });

        // Create questions using bulk create
        return this.createBulk(quizId, { questions });
    }

    /**
     * Get all questions for a quiz with filtering
     */
    async findAll(
        quizId: string,
        filters: {
            questionType?: QuestionType;
            isAnswered?: boolean;
            difficulty?: string;
        } = {}
    ): Promise<QuestionResponseDto[]> {
        const whereClause: any = { quizId };

        if (filters.questionType) {
            whereClause.questionType = this.mapQuestionTypeToEnum(filters.questionType);
        }
        if (filters.isAnswered !== undefined) {
            whereClause.isAnswered = filters.isAnswered;
        }
        if (filters.difficulty) {
            whereClause.difficulty = filters.difficulty as Difficulty;
        }

        const questions = await this.prisma.question.findMany({
            where: whereClause,
            orderBy: { questionNumber: 'asc' }
        });

        return questions.map(question => this.mapToResponseDto(question));
    }

    /**
     * Get questions for a specific round based on round type and participant count
     */
    async getQuestionsForRound(quizId: string, roundType: string, participantCount?: number, questionsPerParticipant?: number): Promise<QuestionResponseDto[]> {
        if (roundType === 'simultaneous') {
            // For simultaneous rounds, get all question types
            const totalQuestionsNeeded = (participantCount || 1) * (questionsPerParticipant || 3);

            const questions = await this.prisma.question.findMany({
                where: {
                    quizId,
                    isAnswered: false,
                    // No questionType filter - get all types
                },
                orderBy: { questionNumber: 'asc' },
                take: totalQuestionsNeeded
            });

            return questions.map(question => this.mapToResponseDto(question));
        } else {
            // For sequential rounds (multiple_choice or yes_no only)
            const questionType = this.mapRoundTypeToQuestionType(roundType);

            const questions = await this.prisma.question.findMany({
                where: {
                    quizId,
                    questionType,
                    isAnswered: false,
                },
                orderBy: { questionNumber: 'asc' },
                ...(questionsPerParticipant && { take: questionsPerParticipant })
            });

            return questions.map(question => this.mapToResponseDto(question));
        }
    }

    /**
     * Get question statistics for a quiz
     */
    async getQuestionStats(quizId: string): Promise<QuestionStatsDto> {
        const [totalQuestions, answeredQuestions, questionsByType] = await Promise.all([
            this.prisma.question.count({ where: { quizId } }),
            this.prisma.question.count({ where: { quizId, isAnswered: true } }),
            this.prisma.question.groupBy({
                by: ['questionType'],
                where: { quizId },
                _count: { questionType: true }
            })
        ]);

        const unansweredByType = await this.prisma.question.groupBy({
            by: ['questionType'],
            where: { quizId, isAnswered: false },
            _count: { questionType: true }
        });

        const typeStats = {
            multiple_choice: 0,
            yes_no: 0
        };

        const unansweredTypeStats = {
            multiple_choice: 0,
            yes_no: 0
        };

        questionsByType.forEach(item => {
            typeStats[item.questionType] = item._count.questionType;
        });

        unansweredByType.forEach(item => {
            unansweredTypeStats[item.questionType] = item._count.questionType;
        });

        return {
            totalQuestions,
            answeredQuestions,
            unansweredQuestions: totalQuestions - answeredQuestions,
            questionsByType: typeStats,
            unansweredByType: unansweredTypeStats
        };
    }

    /**
     * Calculate question requirements for a quiz
     */
    async getQuestionRequirements(quizId: string): Promise<QuestionRequirementsDto> {
        // Get quiz with rounds and participant count
        const quiz = await this.prisma.quiz.findUnique({
            where: { id: quizId },
            include: {
                rounds: true,
                users: { where: { role: 'CONTESTANT' } },
                participantOrders: true
            }
        });

        if (!quiz) {
            throw new NotFoundException('Quiz not found');
        }

        const participantCount = Math.max(quiz.users.length, quiz.participantOrders.length, 1);

        // Calculate requirements based on rounds
        let totalRequired = 0;
        let multipleChoiceRequired = 0;
        let yesNoRequired = 0;

        quiz.rounds.forEach(round => {
            let roundRequirement = 0;

            if (round.quizType === 'simultaneous') {
                // For simultaneous rounds, we need all question types
                // Each participant gets questionsPerParticipant questions
                roundRequirement = participantCount * round.questionsPerParticipant;
                // Add 25% buffer for choice
                roundRequirement = Math.ceil(roundRequirement * 1.25);

                // For simultaneous, we need both question types
                multipleChoiceRequired += Math.ceil(roundRequirement * 0.6); // 60% multiple choice
                yesNoRequired += Math.ceil(roundRequirement * 0.4); // 40% yes/no
            } else {
                // For sequential rounds (multiple_choice or yes_no only)
                const questionsPerRound = participantCount * round.questionsPerParticipant;
                // Add 25% buffer for choice
                roundRequirement = Math.ceil(questionsPerRound * 1.25);

                if (round.quizType === 'multiple_choice') {
                    multipleChoiceRequired += roundRequirement;
                } else if (round.quizType === 'yes_no') {
                    yesNoRequired += roundRequirement;
                }
            }

            totalRequired += roundRequirement;
        });

        // Get current question counts
        const stats = await this.getQuestionStats(quizId);

        return {
            requiredQuestions: totalRequired,
            currentQuestions: stats.totalQuestions,
            shortfall: Math.max(0, totalRequired - stats.totalQuestions),
            questionsByType: {
                multiple_choice: {
                    required: multipleChoiceRequired,
                    current: stats.questionsByType.multiple_choice,
                    shortfall: Math.max(0, multipleChoiceRequired - stats.questionsByType.multiple_choice)
                },
                yes_no: {
                    required: yesNoRequired,
                    current: stats.questionsByType.yes_no,
                    shortfall: Math.max(0, yesNoRequired - stats.questionsByType.yes_no)
                }
            }
        };
    }

    /**
     * Update a question
     */
    async update(quizId: string, questionId: string, updateQuestionDto: UpdateQuestionDto): Promise<QuestionResponseDto> {
        const question = await this.prisma.question.findFirst({
            where: { id: questionId, quizId }
        });

        if (!question) {
            throw new NotFoundException('Question not found');
        }

        // Validate options if they are being updated
        if (updateQuestionDto.options || updateQuestionDto.questionType) {
            const validationDto = {
                ...question,
                ...updateQuestionDto
            };
            this.validateQuestionOptions(validationDto);
        }

        const updatedQuestion = await this.prisma.question.update({
            where: { id: questionId },
            data: updateQuestionDto
        });

        return this.mapToResponseDto(updatedQuestion);
    }

    /**
     * Delete a question
     */
    async remove(quizId: string, questionId: string): Promise<void> {
        const question = await this.prisma.question.findFirst({
            where: { id: questionId, quizId }
        });

        if (!question) {
            throw new NotFoundException('Question not found');
        }

        await this.prisma.question.delete({
            where: { id: questionId }
        });
    }

    /**
     * Mark question as answered
     */
    async markAsAnswered(questionId: string): Promise<void> {
        await this.prisma.question.update({
            where: { id: questionId },
            data: { isAnswered: true }
        });
    }

    /**
     * Reset all questions in a quiz (mark as unanswered)
     */
    async resetQuizQuestions(quizId: string): Promise<void> {
        await this.prisma.question.updateMany({
            where: { quizId },
            data: { isAnswered: false }
        });
    }

    // Private helper methods

    private validateQuestionOptions(questionDto: CreateQuestionDto | any): void {
        const { questionType, options, correctAnswerIndex } = questionDto;

        if (questionType === QuestionType.yes_no) {
            if (options.length !== 2) {
                throw new BadRequestException('Yes/No questions must have exactly 2 options');
            }
            if (correctAnswerIndex < 0 || correctAnswerIndex > 1) {
                throw new BadRequestException('Correct answer index for Yes/No questions must be 0 or 1');
            }
        } else if (questionType === QuestionType.multiple_choice) {
            if (options.length < 2 || options.length > 4) {
                throw new BadRequestException('Multiple choice questions must have 2-4 options');
            }
            if (correctAnswerIndex < 0 || correctAnswerIndex >= options.length) {
                throw new BadRequestException('Correct answer index must be valid for the number of options');
            }
        }
    }

    private mapRoundTypeToQuestionType(roundType: string): import('@prisma/client').QuestionType {
        switch (roundType) {
            case 'yes_no':
                return 'yes_no' as import('@prisma/client').QuestionType;
            case 'multiple_choice':
                return 'multiple_choice' as import('@prisma/client').QuestionType;
            case 'simultaneous':
                return 'multiple_choice' as import('@prisma/client').QuestionType; // Default for simultaneous
            default:
                return 'multiple_choice' as import('@prisma/client').QuestionType;
        }
    }

    private mapQuestionTypeToEnum(questionType: QuestionType): PrismaQuestionType {
        switch (questionType) {
            case QuestionType.yes_no:
                return PrismaQuestionType.yes_no;
            case QuestionType.multiple_choice:
                return PrismaQuestionType.multiple_choice;
            default:
                return PrismaQuestionType.multiple_choice;
        }
    }

    private mapToResponseDto(question: any): QuestionResponseDto {
        return {
            id: question.id,
            quizId: question.quizId,
            questionNumber: question.questionNumber,
            questionText: question.questionText,
            questionType: question.questionType,
            options: question.options,
            correctAnswerIndex: question.correctAnswerIndex,
            isAnswered: question.isAnswered,
            difficulty: question.difficulty,
            createdAt: question.createdAt,
            updatedAt: question.updatedAt
        };
    }

    private async parseCsvFile(buffer: Buffer): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const results: any[] = [];
            const stream = Readable.from(buffer.toString());

            stream
                .pipe(csvParser())
                .on('data', (data) => results.push(data))
                .on('end', () => resolve(results))
                .on('error', (error) => reject(error));
        });
    }

    private async parseExcelFile(buffer: Buffer): Promise<any[]> {
        const workbook = xlsx.read(buffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        return xlsx.utils.sheet_to_json(worksheet);
    }

    private transformFileRowToDto(row: any): CreateQuestionDto {
        // Expected CSV/Excel columns:
        // questionText, questionType, option1, option2, option3, option4, correctAnswerIndex, difficulty

        const options = [row.option1, row.option2, row.option3, row.option4]
            .filter(option => option && option.trim())
            .map(option => option.trim());

        if (options.length < 2) {
            throw new BadRequestException('At least 2 options are required');
        }

        const questionType = row.questionType?.toLowerCase() === 'yes_no' ? QuestionType.yes_no : QuestionType.multiple_choice;
        const correctAnswerIndex = parseInt(row.correctAnswerIndex) || 0;

        return {
            questionText: row.questionText?.trim(),
            questionType,
            options,
            correctAnswerIndex,
            difficulty: row.difficulty || 'medium'
        };
    }
}
