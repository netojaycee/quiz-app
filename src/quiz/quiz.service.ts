import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizDto, CreateContestantDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { QuizResponseDto } from './dto/quiz-response.dto';
import { plainToClass } from 'class-transformer';

@Injectable()
export class QuizService {
    constructor(private prisma: PrismaService) { }

    // Reusable function to find quiz by ID with all relations
    async findQuizById(id: string) {
        const quiz = await this.prisma.quiz.findUnique({
            where: { id },
            include: {
                rounds: {
                    orderBy: { roundNumber: 'asc' },
                },
                contestants: {
                    include: {
                        user: {
                            select: { id: true, username: true, role: true },
                        },
                    },
                },
                positions: {
                    include: {
                        user: {
                            select: { id: true, username: true },
                        },
                    },
                    orderBy: { position: 'asc' },
                },
                users: {
                    select: { id: true, username: true, role: true },
                },
            },
        });

        if (!quiz) {
            throw new NotFoundException(`Quiz with ID ${id} not found`);
        }

        return quiz;
    }

    // Reusable function to validate users exist
    async validateUsersExist(userIds: string[]) {
        if (!userIds || userIds.length === 0) return [];

        const users = await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, role: true },
        });

        if (users.length !== userIds.length) {
            const foundIds = users.map(user => user.id);
            const notFoundIds = userIds.filter(id => !foundIds.includes(id));
            throw new BadRequestException(`Users not found: ${notFoundIds.join(', ')}`);
        }

        return users;
    }

    // Reusable function to validate round numbers are unique and sequential
    private validateRounds(rounds: any[]) {
        const roundNumbers = rounds.map(r => r.roundNumber);
        const uniqueNumbers = [...new Set(roundNumbers)];

        if (uniqueNumbers.length !== rounds.length) {
            throw new BadRequestException('Round numbers must be unique');
        }

        // Check if rounds are sequential starting from 1
        const sortedNumbers = uniqueNumbers.sort((a, b) => a - b);
        for (let i = 0; i < sortedNumbers.length; i++) {
            if (sortedNumbers[i] !== i + 1) {
                throw new BadRequestException('Round numbers must be sequential starting from 1');
            }
        }
    }

    // Reusable function to check if contestant names already exist for user in quiz
    async validateContestantsNotExist(quizId: string, userId: string, contestantNames: string[]) {
        if (!contestantNames || contestantNames.length === 0) return;

        const existingContestants = await this.prisma.contestant.findMany({
            where: {
                quizId,
                userId,
                name: { in: contestantNames },
            },
        });

        if (existingContestants.length > 0) {
            const duplicateNames = existingContestants.map(c => c.name);
            throw new ConflictException(`Contestant names already exist for this user in this quiz: ${duplicateNames.join(', ')}`);
        }
    }

    async create(createQuizDto: CreateQuizDto, userId: string) {
        // Validate rounds
        this.validateRounds(createQuizDto.rounds);

        // Validate users exist (if provided)
        const validatedUsers = await this.validateUsersExist(createQuizDto.userIds || []);

        // Validate contestant names are unique for this user (if provided)
        if (createQuizDto.contestants && createQuizDto.contestants.length > 0) {
            const contestantNames = createQuizDto.contestants.map(c => c.name);
            // We'll validate after quiz creation
        }

        // Create quiz with rounds and contestants in a transaction
        const quiz = await this.prisma.$transaction(async (tx) => {
            // Create the quiz
            const newQuiz = await tx.quiz.create({
                data: {
                    name: createQuizDto.name,
                    rounds: {
                        create: createQuizDto.rounds.map(round => ({
                            roundNumber: round.roundNumber,
                            quizType: round.quizType,
                            timePerQuestion: round.timePerQuestion,
                        })),
                    },
                    // Associate users with quiz if provided
                    ...(createQuizDto.userIds && {
                        users: {
                            connect: createQuizDto.userIds.map(id => ({ id })),
                        },
                    }),
                },
                include: {
                    rounds: { orderBy: { roundNumber: 'asc' } },
                },
            });

            // Create contestants if provided (they belong to the creating user)
            if (createQuizDto.contestants && createQuizDto.contestants.length > 0) {
                await tx.contestant.createMany({
                    data: createQuizDto.contestants.map(contestant => ({
                        name: contestant.name,
                        location: contestant.location,
                        userId: userId, // The user creating the quiz
                        quizId: newQuiz.id,
                    })),
                });
            }

            return newQuiz;
        });

        // Return the complete quiz with all relations
        return this.findQuizById(quiz.id);
    }

    async findAll() {
        const quizzes = await this.prisma.quiz.findMany({
            include: {
                rounds: {
                    orderBy: { roundNumber: 'asc' },
                },
                contestants: {
                    include: {
                        user: {
                            select: { id: true, username: true, role: true },
                        },
                    },
                },
                positions: {
                    include: {
                        user: {
                            select: { id: true, username: true },
                        },
                    },
                    orderBy: { position: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return quizzes.map(quiz => plainToClass(QuizResponseDto, quiz, { excludeExtraneousValues: true }));
    }

    async findOne(id: string) {
        const quiz = await this.findQuizById(id);
        return plainToClass(QuizResponseDto, quiz, { excludeExtraneousValues: true });
    }

    async update(id: string, updateQuizDto: UpdateQuizDto, userId?: string) {
        // Check if quiz exists
        await this.findQuizById(id);

        // Validate rounds if provided
        if (updateQuizDto.rounds) {
            this.validateRounds(updateQuizDto.rounds);
        }

        // Validate users if provided
        if (updateQuizDto.userIds) {
            await this.validateUsersExist(updateQuizDto.userIds);
        }

        // Validate contestants if provided (they will belong to the updating user)
        if (updateQuizDto.contestants && userId) {
            const contestantNames = updateQuizDto.contestants.map(c => c.name);
            await this.validateContestantsNotExist(id, userId, contestantNames);
        }

        const updatedQuiz = await this.prisma.$transaction(async (tx) => {
            // Update basic quiz info
            const quiz = await tx.quiz.update({
                where: { id },
                data: {
                    ...(updateQuizDto.name && { name: updateQuizDto.name }),
                    ...(updateQuizDto.isActive !== undefined && { isActive: updateQuizDto.isActive }),
                    ...(updateQuizDto.winnerId && { winnerId: updateQuizDto.winnerId }),
                },
            });

            // Update rounds if provided
            if (updateQuizDto.rounds) {
                // Delete existing rounds
                await tx.round.deleteMany({ where: { quizId: id } });

                // Create new rounds
                await tx.round.createMany({
                    data: updateQuizDto.rounds.map(round => ({
                        quizId: id,
                        roundNumber: round.roundNumber,
                        quizType: round.quizType,
                        timePerQuestion: round.timePerQuestion,
                    })),
                });
            }

            // Add new contestants if provided (they belong to the updating user)
            if (updateQuizDto.contestants && userId) {
                await tx.contestant.createMany({
                    data: updateQuizDto.contestants.map(contestant => ({
                        name: contestant.name,
                        location: contestant.location,
                        userId: userId,
                        quizId: id,
                    })),
                });
            }

            // Update user associations if provided
            if (updateQuizDto.userIds) {
                await tx.quiz.update({
                    where: { id },
                    data: {
                        users: {
                            set: updateQuizDto.userIds.map(userId => ({ id: userId })),
                        },
                    },
                });
            }

            return quiz;
        });

        // Return the complete updated quiz
        return this.findQuizById(id);
    }

    async remove(id: string) {
        // Check if quiz exists
        await this.findQuizById(id);

        // Delete quiz and all related records (cascading)
        await this.prisma.$transaction(async (tx) => {
            // Delete responses
            await tx.response.deleteMany({ where: { quizId: id } });

            // Delete scores
            await tx.score.deleteMany({ where: { quizId: id } });

            // Delete positions
            await tx.quizPosition.deleteMany({ where: { quizId: id } });

            // Delete contestants
            await tx.contestant.deleteMany({ where: { quizId: id } });

            // Delete questions
            await tx.question.deleteMany({ where: { quizId: id } });

            // Delete rounds
            await tx.round.deleteMany({ where: { quizId: id } });

            // Finally delete the quiz
            await tx.quiz.delete({ where: { id } });
        });

        return { message: 'Quiz deleted successfully' };
    }

    // Additional utility methods

    async addContestants(quizId: string, userId: string, contestants: CreateContestantDto[]) {
        await this.findQuizById(quizId);
        await this.validateUsersExist([userId]);

        const contestantNames = contestants.map(c => c.name);
        await this.validateContestantsNotExist(quizId, userId, contestantNames);

        await this.prisma.contestant.createMany({
            data: contestants.map(contestant => ({
                name: contestant.name,
                location: contestant.location,
                userId,
                quizId,
            })),
        });

        return this.findQuizById(quizId);
    }

    async removeContestant(quizId: string, contestantId: string) {
        await this.findQuizById(quizId);

        const contestant = await this.prisma.contestant.findUnique({
            where: { id: contestantId },
        });

        if (!contestant || contestant.quizId !== quizId) {
            throw new NotFoundException('Contestant not found in this quiz');
        }

        await this.prisma.contestant.delete({
            where: { id: contestantId },
        });

        return { message: 'Contestant removed successfully' };
    }

    async setWinner(quizId: string, winnerId: string) {
        await this.findQuizById(quizId);
        await this.validateUsersExist([winnerId]);

        const updatedQuiz = await this.prisma.quiz.update({
            where: { id: quizId },
            data: { winnerId },
        });

        return this.findQuizById(quizId);
    }

    // Scoring and leaderboard utility methods

    async calculateRoundScore(userId: string, quizId: string, roundId: string) {
        // Get all responses for this user in this round
        const responses = await this.prisma.response.findMany({
            where: {
                userId,
                quizId,
                roundId,
            },
            include: {
                question: true,
            },
        });

        // Calculate round score
        const roundScore = responses.reduce((total, response) => {
            return total + response.pointsEarned;
        }, 0);

        const questionsAnswered = responses.length;
        const questionsCorrect = responses.filter(r => r.isCorrect).length;

        // Update or create score record
        await this.prisma.score.upsert({
            where: {
                userId_quizId_roundId: {
                    userId,
                    quizId,
                    roundId,
                },
            },
            update: {
                roundScore,
                questionsAnswered,
                questionsCorrect,
            },
            create: {
                userId,
                quizId,
                roundId,
                roundScore,
                questionsAnswered,
                questionsCorrect,
            },
        });

        return {
            roundScore,
            questionsAnswered,
            questionsCorrect,
        };
    }

    async calculateQuizTotalScore(userId: string, quizId: string) {
        // Get all round scores for this user in this quiz
        const roundScores = await this.prisma.score.findMany({
            where: {
                userId,
                quizId,
            },
        });

        const totalScore = roundScores.reduce((total, score) => {
            return total + score.roundScore;
        }, 0);

        const totalQuestionsAnswered = roundScores.reduce((total, score) => {
            return total + score.questionsAnswered;
        }, 0);

        const totalQuestionsCorrect = roundScores.reduce((total, score) => {
            return total + score.questionsCorrect;
        }, 0);

        return {
            totalScore,
            totalQuestionsAnswered,
            totalQuestionsCorrect,
            roundBreakdown: roundScores,
        };
    }

    async getQuizLeaderboard(quizId: string) {
        await this.findQuizById(quizId); // Validate quiz exists

        // Get all users who have scores in this quiz
        const userScores = await this.prisma.score.findMany({
            where: { quizId },
            include: {
                user: {
                    select: { id: true, username: true, role: true },
                },
                round: {
                    select: { roundNumber: true },
                },
            },
        });

        // Group by user and calculate totals
        const userTotals = new Map();

        userScores.forEach(score => {
            const userId = score.userId;
            if (!userTotals.has(userId)) {
                userTotals.set(userId, {
                    user: score.user,
                    totalScore: 0,
                    totalQuestionsAnswered: 0,
                    totalQuestionsCorrect: 0,
                    rounds: [],
                });
            }

            const userTotal = userTotals.get(userId);
            userTotal.totalScore += score.roundScore;
            userTotal.totalQuestionsAnswered += score.questionsAnswered;
            userTotal.totalQuestionsCorrect += score.questionsCorrect;
            userTotal.rounds.push({
                roundNumber: score.round.roundNumber,
                roundScore: score.roundScore,
                questionsAnswered: score.questionsAnswered,
                questionsCorrect: score.questionsCorrect,
            });
        });

        // Convert to array and sort by total score (descending)
        const leaderboard = Array.from(userTotals.values())
            .sort((a, b) => b.totalScore - a.totalScore)
            .map((entry, index) => ({
                position: index + 1,
                ...entry,
                rounds: entry.rounds.sort((a, b) => a.roundNumber - b.roundNumber),
            }));

        return leaderboard;
    }

    async updateQuizPositions(quizId: string) {
        const leaderboard = await this.getQuizLeaderboard(quizId);

        // Delete existing positions
        await this.prisma.quizPosition.deleteMany({
            where: { quizId },
        });

        // Create new positions
        if (leaderboard.length > 0) {
            await this.prisma.quizPosition.createMany({
                data: leaderboard.map(entry => ({
                    userId: entry.user.id,
                    quizId,
                    position: entry.position,
                    totalScore: entry.totalScore,
                })),
            });

            // Set winner (1st place)
            if (leaderboard[0]) {
                await this.prisma.quiz.update({
                    where: { id: quizId },
                    data: { winnerId: leaderboard[0].user.id },
                });
            }
        }

        return leaderboard;
    }

    async submitResponse(userId: string, questionId: string, selectedIndex: number) {
        // Get question details
        const question = await this.prisma.question.findUnique({
            where: { id: questionId },
        });

        if (!question) {
            throw new NotFoundException('Question not found');
        }

        // Check if user already answered this question
        const existingResponse = await this.prisma.response.findUnique({
            where: {
                userId_questionId: {
                    userId,
                    questionId,
                },
            },
        });

        if (existingResponse) {
            throw new ConflictException('User has already answered this question');
        }

        // Calculate response
        const isCorrect = selectedIndex === question.correctAnswerIndex;
        const pointsEarned = isCorrect ? question.points : 0;

        // Create response
        const response = await this.prisma.response.create({
            data: {
                userId,
                quizId: question.quizId,
                roundId: question.roundId,
                questionId,
                selectedIndex,
                isCorrect,
                pointsEarned,
            },
        });

        // Recalculate round score
        await this.calculateRoundScore(userId, question.quizId, question.roundId);

        // Update quiz positions
        await this.updateQuizPositions(question.quizId);

        return response;
    }

    async getQuizResults(quizId: string) {
        await this.findQuizById(quizId);

        const leaderboard = await this.getQuizLeaderboard(quizId);

        // Get quiz details with contestants
        const quiz = await this.prisma.quiz.findUnique({
            where: { id: quizId },
            include: {
                contestants: {
                    include: {
                        user: {
                            select: { id: true, username: true },
                        },
                    },
                },
                rounds: {
                    orderBy: { roundNumber: 'asc' },
                    include: {
                        questions: {
                            orderBy: { questionNumber: 'asc' },
                            select: { id: true, questionNumber: true, points: true },
                        },
                    },
                },
            },
        });

        return {
            quiz: {
                id: quiz.id,
                name: quiz.name,
                winnerId: quiz.winnerId,
            },
            leaderboard,
            contestants: quiz.contestants,
            rounds: quiz.rounds,
        };
    }
}
