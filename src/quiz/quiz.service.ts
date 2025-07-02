import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizDto, CreateContestantDto, CreateUserWithContestantsDto } from './dto/create-quiz.dto';
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

    // Reusable function to check if username already exists
    async validateUsernameUnique(username: string) {
        const existingUser = await this.prisma.user.findUnique({
            where: { username },
        });

        if (existingUser) {
            throw new ConflictException(`Username '${username}' already exists`);
        }
    }

    async create(createQuizDto: CreateQuizDto, moderatorId: string) {
        // Validate rounds
        this.validateRounds(createQuizDto.rounds);

        // Validate existing users (if provided)
        // const validatedUsers = await this.validateUsersExist(createQuizDto.existingUserIds || []);

        // Validate all usernames are unique before creating
        for (const userData of createQuizDto.users) {
            await this.validateUsernameUnique(userData.username);
        }

        // Create quiz with users and contestants in a transaction
        const quiz = await this.prisma.$transaction(async (tx) => {
            // Create the quiz first
            const newQuiz = await tx.quiz.create({
                data: {
                    name: createQuizDto.name,
                    rounds: {
                        create: createQuizDto.rounds.map(round => ({
                            roundNumber: round.roundNumber,
                            quizType: round.quizType,
                            timePerQuestion: round.timePerQuestion,
                            questionsPerParticipant: round.questionsPerParticipant || 3,
                        })),
                    },
                },
                include: {
                    rounds: { orderBy: { roundNumber: 'asc' } },
                },
            });

            // Collect all user IDs that will be associated with the quiz
            const allUserIds: string[] = [];

            // Add existing user IDs if provided
            if (createQuizDto.existingUserIds) {
                allUserIds.push(...createQuizDto.existingUserIds);
            }

            // Create new users and collect their IDs
            for (const userData of createQuizDto.users) {
                // Create user account
                const newUser = await tx.user.create({
                    data: {
                        username: userData.username,
                        // Don't set password field at all for contestants
                        role: 'CONTESTANT',
                    },
                });

                allUserIds.push(newUser.id);

                // Create contestants for this user in batch
                if (userData.contestants.length > 0) {
                    await tx.contestant.createMany({
                        data: userData.contestants.map(contestant => ({
                            name: contestant.name,
                            location: contestant.location,
                            userId: newUser.id,
                            quizId: newQuiz.id,
                        })),
                    });
                }
            }

            // Associate all users with the quiz in one operation
            if (allUserIds.length > 0) {
                await tx.quiz.update({
                    where: { id: newQuiz.id },
                    data: {
                        users: {
                            connect: allUserIds.map(id => ({ id })),
                        },
                    },
                });
            }

            return newQuiz;
        }, {
            timeout: 30000, // 30 seconds timeout
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

    /**
     * Update a quiz with flexible user association management.
     * 
     * Two modes of operation:
     * 1. Replace Mode: When existingUserIds is provided, ALL user associations are replaced
     * 2. Additive Mode: When existingUserIds is NOT provided, users are added/removed incrementally
     * 
     * @param id Quiz ID to update
     * @param updateQuizDto Update data
     * @param userId Optional user ID (for future authorization)
     * @returns Updated quiz with all relations
     */
    async update(id: string, updateQuizDto: UpdateQuizDto, userId?: string) {
        // Check if quiz exists
        const existingQuiz = await this.findQuizById(id);

        // Validate rounds if provided
        if (updateQuizDto.rounds) {
            this.validateRounds(updateQuizDto.rounds);
        }

        // Validate existing users if provided
        if (updateQuizDto.existingUserIds) {
            await this.validateUsersExist(updateQuizDto.existingUserIds);
        }

        // Validate additional existing users if provided
        if (updateQuizDto.addExistingUserIds) {
            await this.validateUsersExist(updateQuizDto.addExistingUserIds);
        }

        // Validate users to remove if provided
        if (updateQuizDto.removeUserIds) {
            await this.validateUsersExist(updateQuizDto.removeUserIds);
        }

        // Validate new user usernames are unique (before transaction)
        if (updateQuizDto.users) {
            for (const userData of updateQuizDto.users) {
                await this.validateUsernameUnique(userData.username);
            }
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
                // Delete existing rounds (and related data)
                await tx.question.deleteMany({ where: { quizId: id } });
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

            // Handle user associations
            let userAssociationUpdate = false;

            // Case 1: Replace all user associations (if existingUserIds is provided)
            if (updateQuizDto.existingUserIds) {
                const allUserIds: string[] = [...updateQuizDto.existingUserIds];

                // Add new users if provided
                if (updateQuizDto.users) {
                    for (const userData of updateQuizDto.users) {
                        // Create user account
                        const newUser = await tx.user.create({
                            data: {
                                username: userData.username,
                                // Don't set password field at all for contestants
                                role: 'CONTESTANT',
                            },
                        });

                        allUserIds.push(newUser.id);

                        // Create contestants for this user
                        await tx.contestant.createMany({
                            data: userData.contestants.map(contestant => ({
                                name: contestant.name,
                                location: contestant.location,
                                userId: newUser.id,
                                quizId: id,
                            })),
                        });
                    }
                }

                // Remove duplicates and set all associations
                const uniqueUserIds = [...new Set(allUserIds)];
                await tx.quiz.update({
                    where: { id },
                    data: {
                        users: {
                            set: uniqueUserIds.map(userId => ({ id: userId })),
                        },
                    },
                });

                userAssociationUpdate = true;
            }
            // Case 2: Additive updates (add/remove users from existing associations)
            else {
                // Add new users if provided
                if (updateQuizDto.users) {
                    for (const userData of updateQuizDto.users) {
                        // Create user account
                        const newUser = await tx.user.create({
                            data: {
                                username: userData.username,
                                // Don't set password field at all for contestants
                                role: 'CONTESTANT',
                            },
                        });

                        // Create contestants for this user
                        await tx.contestant.createMany({
                            data: userData.contestants.map(contestant => ({
                                name: contestant.name,
                                location: contestant.location,
                                userId: newUser.id,
                                quizId: id,
                            })),
                        });

                        // Connect the new user to the quiz
                        await tx.quiz.update({
                            where: { id },
                            data: {
                                users: {
                                    connect: { id: newUser.id },
                                },
                            },
                        });
                    }
                }

                // Add existing users if provided
                if (updateQuizDto.addExistingUserIds) {
                    await tx.quiz.update({
                        where: { id },
                        data: {
                            users: {
                                connect: updateQuizDto.addExistingUserIds.map(userId => ({ id: userId })),
                            },
                        },
                    });
                }

                // Remove users if provided
                if (updateQuizDto.removeUserIds) {
                    // Also remove their contestants from this quiz
                    await tx.contestant.deleteMany({
                        where: {
                            quizId: id,
                            userId: { in: updateQuizDto.removeUserIds }
                        }
                    });

                    await tx.quiz.update({
                        where: { id },
                        data: {
                            users: {
                                disconnect: updateQuizDto.removeUserIds.map(userId => ({ id: userId })),
                            },
                        },
                    });
                }
            }

            return quiz;
        }, {
            timeout: 30000, // 30 seconds timeout
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
        }, {
            timeout: 30000, // 30 seconds timeout
        });

        return { message: 'Quiz deleted successfully' };
    }

    // Additional utility methods

    async addContestants(quizId: string, userId: string, contestants: CreateContestantDto[]) {
        await this.findQuizById(quizId);
        await this.validateUsersExist([userId]);

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

    async submitResponse(userId: string, questionId: string, selectedIndex: number, roundId: string, points: number, isCorrect: boolean) {
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
        // const isCorrect = selectedIndex === question.correctAnswerIndex;

        // Create response
        const response = await this.prisma.response.create({
            data: {
                userId,
                quizId: question.quizId,
                roundId,
                questionId,
                selectedIndex,
                isCorrect,
                pointsEarned: points, // Use points parameter for dynamic scoring
            },
        });

        // Recalculate round score
        await this.calculateRoundScore(userId, question.quizId, roundId);

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

                questions: {
                    orderBy: { questionNumber: 'asc' },
                    select: { id: true, questionNumber: true },
                },

                rounds: {
                    orderBy: { roundNumber: 'asc' },

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
            questions: quiz.questions,
        };
    }
}
