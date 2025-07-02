import {
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { QuizService } from './quiz.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionsService } from '../questions/questions.service';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WsJwtGuard } from '../socket/guards/ws-jwt.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User, UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '@/users/users.service';

/**
 * Quiz Gateway for real-time quiz interactions
 * 
 * Features:
 * - Join quiz rooms (contestants auto-join on login, moderators/audience join manually)
 * - Start rounds with question fetching from Redis cache
 * - Sequential answering for multiple_choice and yes_no types
 * - Simultaneous answering for simultaneous type
 * - Participant order management with drag-and-drop support
 * - Real-time answer validation and scoring
 * - Moderator controls for managing quiz flow
 */
@WebSocketGateway({
    cors: { origin: '*' },
    transports: ['websocket'],
    namespace: '/quiz'
})
export class QuizGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private logger: Logger = new Logger('QuizGateway');

    // In-memory storage for active quiz sessions
    private activeParticipants: Map<string, string> = new Map(); // quizId -> active userId
    private currentQuestionIndex: Map<string, number> = new Map(); // quizId:roundId -> current question index
    private connectedUsers: Map<string, { userId: string; role: UserRole; quizId?: string; user: User }> = new Map();
    // Bonus round state management
    private bonusState: Map<string, {
        originalUserId: string;
        bonusUserId: string;
        questionId: string;
        isActive: boolean
    }> = new Map(); // quizId -> bonus state

    // constructor(
    //     private readonly quizService: QuizService,
    //     private readonly redisService: RedisService,
    //     private readonly prisma: PrismaService,
    // ) { }

    // handleConnection(client: Socket) {
    //     console.log(`Client connected: ${client.id}`);
    // }

    // handleDisconnect(client: Socket) {
    //     console.log(`Client disconnected: ${client.id}`);
    //     this.connectedUsers.delete(client.id);
    // }

    constructor(
        private readonly quizService: QuizService,
        private readonly redisService: RedisService,
        private readonly prisma: PrismaService,
        private readonly questionsService: QuestionsService,
        private readonly jwtService: JwtService,
        private readonly usersService: UsersService,
    ) { }

    afterInit(server: Server) {
        this.logger.log('Quiz WebSocket Gateway initialized');
    }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth?.token ||
                client.handshake.headers?.authorization?.replace('Bearer ', '') ||
                client.handshake.query?.token;

            if (!token) {
                this.logger.warn(`Quiz client ${client.id} connected without token`);
                client.emit('error', {
                    message: 'Authentication required. Please provide a valid token.',
                    code: 'AUTH_REQUIRED'
                });
                client.disconnect();
                return;
            }

            const payload = this.jwtService.verify(token);
            const userDto = await this.usersService.findOne(payload.sub);

            if (!userDto) {
                this.logger.warn(`Invalid user for quiz client ${client.id}`);
                client.emit('error', {
                    message: 'Invalid authentication token. Please login again.',
                    code: 'INVALID_TOKEN'
                });
                client.disconnect();
                return;
            }

            // Get full user data from Prisma for internal use
            const user = await this.prisma.user.findUnique({
                where: { id: userDto.id }
            });

            if (!user) {
                this.logger.warn(`User data not found for quiz client ${client.id}`);
                client.emit('error', {
                    message: 'User data not found. Please login again.',
                    code: 'USER_NOT_FOUND'
                });
                client.disconnect();
                return;
            }

            // Store user connection info
            this.connectedUsers.set(client.id, {
                userId: user.id,
                role: user.role,
                quizId: user.quizId,
                user: user
            });

            // Set user data on client
            client.data.user = user;

            // Join role-based rooms
            client.join(`role:${user.role}`);
            client.join(`user:${user.id}`);

            this.logger.log(`Quiz client ${client.id} connected as ${user.username} (${user.role})`);

            // For contestants, auto-join their assigned quiz if they have one
            if (user.role === 'CONTESTANT' && user.quizId) {
                await this.autoJoinQuiz(client, user);
            }

            // Send connection success
            client.emit('connected', {
                userId: user.id,
                username: user.username,
                role: user.role,
                quizId: user.quizId,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error(`Quiz connection error for client ${client.id}:`, error.message);
            client.emit('error', {
                message: 'Authentication failed. Please check your token and try again.',
                code: 'AUTH_FAILED',
                details: error.message
            });
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        const userConnection = this.connectedUsers.get(client.id);

        if (userConnection) {
            const { user } = userConnection;
            this.connectedUsers.delete(client.id);

            this.logger.log(`Quiz client ${client.id} (${user.username} - ${user.role}) disconnected`);

            // Notify others in quiz rooms about disconnection
            if (userConnection.quizId) {
                client.to(userConnection.quizId).emit('userDisconnected', {
                    userId: user.id,
                    username: user.username,
                    role: user.role,
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            this.logger.log(`Quiz client ${client.id} disconnected (no user data)`);
        }
    }

    /**
     * Auto-join quiz for contestants on connection
     */
    private async autoJoinQuiz(client: Socket, user: User) {
        if (!user.quizId) return;

        try {
            // Verify quiz exists and is active
            const quiz = await this.prisma.quiz.findUnique({
                where: { id: user.quizId },
                include: {
                    users: {
                        select: { id: true, username: true, role: true }
                    }
                }
            });

            if (!quiz) {
                this.logger.warn(`Quiz ${user.quizId} not found for user ${user.username}`);
                return;
            }

            // Join the quiz room
            await client.join(user.quizId);

            // Update connection info
            const userConnection = this.connectedUsers.get(client.id);
            if (userConnection) {
                userConnection.quizId = user.quizId;
            }

            // Get participant order
            const participantOrder = await this.redisService.getParticipantOrder(user.quizId) ||
                await this.getDefaultParticipantOrder(user.quizId);

            // Notify about auto-join
            client.emit('autoJoinedQuiz', {
                quizId: user.quizId,
                quizName: quiz.name,
                role: user.role,
                username: user.username,
                participantOrder,
                isActive: quiz.isActive,
                timestamp: new Date().toISOString()
            });

            // Notify others in the quiz room
            client.to(user.quizId).emit('userJoined', {
                userId: user.id,
                username: user.username,
                role: user.role,
                isAutoJoin: true,
                timestamp: new Date().toISOString()
            });

            this.logger.log(`${user.username} (${user.role}) auto-joined quiz ${user.quizId}`);

        } catch (error) {
            this.logger.error(`Auto-join failed for ${user.username}:`, error.message);
        }
    }
    /**
     * Join a quiz room
     * For contestants: automatically called after login with their assigned quiz
     * For moderators/audience: manually called with specific quiz ID
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('joinQuiz')
    async handleJoinQuiz(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { quizId: string; userId?: string }
    ) {
        try {
            console.log(payload, "payload")
            const authenticatedUser = client.data.user as User;

            if (!authenticatedUser) {
                this.logger.warn(`Unauthenticated joinQuiz attempt from client ${client.id}`);
                client.emit('error', { message: 'Authentication required', code: 'AUTH_REQUIRED' });
                return;
            }

            // Validate payload
            if (!payload || !payload.quizId || typeof payload.quizId !== 'string') {
                this.logger.warn(`Invalid payload for joinQuiz from ${authenticatedUser.username}: ${JSON.stringify(payload)}`);
                client.emit('error', {
                    message: 'Invalid request. QuizId is required.',
                    code: 'INVALID_PAYLOAD',
                    expectedFormat: { quizId: 'string' }
                });
                return;
            }

            // Get full user details from database
            const user = await this.prisma.user.findUnique({
                where: { id: authenticatedUser.id },
                select: { id: true, username: true, role: true, quizId: true }
            });

            if (!user) {
                this.logger.warn(`User not found for joinQuiz from client ${client.id}`);
                client.emit('error', { message: 'User not found' });
                return;
            }

            this.logger.log(`${user.username} (${user.role}) attempting to join quiz ${payload.quizId}`);

            // Verify quiz exists
            const quiz = await this.prisma.quiz.findUnique({
                where: { id: payload.quizId },
                include: {
                    users: {
                        select: { id: true, username: true, role: true }
                    }
                }
            });

            if (!quiz) {
                this.logger.warn(`Quiz ${payload.quizId} not found for joinQuiz from user ${user.username}`);
                client.emit('error', { message: 'Quiz not found', code: 'QUIZ_NOT_FOUND' });
                return;
            }

            // Check permissions
            if (user.role === 'CONTESTANT' && user.quizId !== payload.quizId) {
                this.logger.warn(`Unauthorized quiz access attempt by ${user.username} for quiz ${payload.quizId}`);
                client.emit('error', { message: 'Not authorized for this quiz' });
                return;
            }

            // Join the quiz room
            await client.join(payload.quizId);

            // Store user connection info with full user object
            this.connectedUsers.set(client.id, {
                userId: user.id,
                role: user.role,
                quizId: payload.quizId,
                user: user as User
            });

            // Get participant order for this quiz
            const participantOrder = await this.redisService.getParticipantOrder(payload.quizId) ||
                await this.getDefaultParticipantOrder(payload.quizId);

            client.emit('quizJoined', {
                quizId: payload.quizId,
                role: user.role,
                username: user.username,
                participantOrder: user.role !== 'AUDIENCE' ? participantOrder : undefined,
                isActive: quiz.isActive
            });

            // Notify others in the room
            client.to(payload.quizId).emit('userJoined', {
                userId: user.id,
                username: user.username,
                role: user.role
            });

            this.logger.log(`${user.username} (${user.role}) successfully joined quiz ${payload.quizId}`);

        } catch (error) {
            this.logger.error(`Failed to join quiz for ${client.data.user?.username || 'unknown'}:`, error.message);
            client.emit('error', { message: 'Failed to join quiz', error: error.message });
        }
    }

    /**
     * Update participant order (drag and drop support)
     * Only allowed before the first round starts
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('updateParticipantOrder')
    async handleUpdateParticipantOrder(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { quizId: string; participantOrder: { userId: string; orderIndex: number }[] }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo || userInfo.role !== 'MODERATOR') {
                this.logger.warn(`Non-moderator ${userInfo?.user.username || 'unknown'} attempted to update participant order`);
                client.emit('error', { message: 'Only moderators can update participant order' });
                return;
            }

            this.logger.log(`${userInfo.user.username} (${userInfo.role}) updating participant order for quiz ${payload.quizId}`);

            // Check if any round has started
            const activeRound = await this.prisma.round.findFirst({
                where: { quizId: payload.quizId, isActive: true }
            });

            if (activeRound) {
                this.logger.warn(`${userInfo.user.username} attempted to change order after round started for quiz ${payload.quizId}`);
                client.emit('error', { message: 'Cannot change order after round has started' });
                return;
            }

            // Update participant order in database
            await this.prisma.$transaction(async (tx) => {
                // Delete existing order
                await tx.participantOrder.deleteMany({
                    where: { quizId: payload.quizId }
                });

                // Create new order
                await tx.participantOrder.createMany({
                    data: payload.participantOrder.map(p => ({
                        quizId: payload.quizId,
                        userId: p.userId,
                        orderIndex: p.orderIndex
                    }))
                });
            });

            // Cache the new order
            await this.redisService.cacheParticipantOrder(payload.quizId, payload.participantOrder);

            // Broadcast the updated order to all participants
            this.server.to(payload.quizId).emit('participantOrderUpdated', {
                participantOrder: payload.participantOrder
            });

            this.logger.log(`Participant order updated successfully for quiz ${payload.quizId} by ${userInfo.user.username}`);

        } catch (error) {
            this.logger.error(`Failed to update participant order for quiz ${payload.quizId}:`, error.message);
            client.emit('error', { message: 'Failed to update participant order', error: error.message });
        }
    }

    /**
     * Start a round
     * Only moderators can start rounds
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('startRound')
    async handleStartRound(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { quizId: string; roundId: string }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo || userInfo.role !== 'MODERATOR') {
                this.logger.warn(`Non-moderator ${userInfo?.user.username || 'unknown'} attempted to start round`);
                client.emit('error', { message: 'Only moderators can start rounds' });
                return;
            }

            this.logger.log(`${userInfo.user.username} (${userInfo.role}) starting round ${payload.roundId} for quiz ${payload.quizId}`);

            // Get round details
            const round = await this.prisma.round.findUnique({
                where: { id: payload.roundId },
                include: { quiz: true }
            });

            if (!round || round.quizId !== payload.quizId) {
                this.logger.warn(`Round ${payload.roundId} not found for quiz ${payload.quizId} by ${userInfo.user.username}`);
                client.emit('error', { message: 'Round not found' });
                return;
            }

            // Mark round as active
            await this.prisma.round.update({
                where: { id: payload.roundId },
                data: { isActive: true }
            });

            // Get questions for this round from cache or database
            let questions = await this.redisService.getRoundQuestions(payload.quizId, payload.roundId);

            if (!questions) {
                // Get participant count for question allocation
                const participantCount = await this.getParticipantCount(payload.quizId);

                questions = await this.questionsService.getQuestionsForRound(
                    payload.quizId,
                    round.quizType,
                    participantCount,
                    round.questionsPerParticipant
                );

                await this.redisService.cacheRoundQuestions(payload.quizId, payload.roundId, questions);
            }

            if (!questions || questions.length === 0) {
                client.emit('error', { message: 'No questions available for this round' });
                return;
            }

            // Prepare questions for client (hide correct answers)
            const clientQuestions = questions.map(q => ({
                id: q.id,
                questionText: q.questionText,
                options: q.options,
                points: q.points
            }));

            // Initialize question index
            await this.redisService.setCurrentQuestionIndex(payload.quizId, payload.roundId, 0);

            if (round.quizType === 'simultaneous') {
                // Simultaneous mode: each participant gets their own set of questions
                const participantCount = await this.getParticipantCount(payload.quizId);
                const questionsPerParticipant = round.questionsPerParticipant || 3;

                // Get participant order to assign unique questions to each participant
                const participantOrder = await this.redisService.getParticipantOrder(payload.quizId) ||
                    await this.getDefaultParticipantOrder(payload.quizId);

                if (participantOrder.length === 0) {
                    client.emit('error', { message: 'No participants found for this quiz' });
                    return;
                }

                // Distribute questions among participants
                const participantQuestions = {};
                for (let i = 0; i < participantOrder.length; i++) {
                    const startIndex = i * questionsPerParticipant;
                    const endIndex = startIndex + questionsPerParticipant;
                    const userQuestions = questions.slice(startIndex, endIndex);

                    participantQuestions[participantOrder[i].userId] = userQuestions.map(q => ({
                        id: q.id,
                        questionText: q.questionText,
                        options: q.options,
                        questionNumber: q.questionNumber
                    }));
                }

                // Start simultaneous round with total round time
                this.server.to(payload.quizId).emit('simultaneousRoundStarted', {
                    roundId: payload.roundId,
                    quizType: round.quizType,
                    participantQuestions,
                    totalRoundTime: round.timePerQuestion, // Total time for all questions
                    questionsPerParticipant,
                    pointsPerCorrect: 5 // Simultaneous mode gives 5 points per correct answer
                });
            } else {
                // Sequential mode: get participant order and start with first participant
                const participantOrder = await this.redisService.getParticipantOrder(payload.quizId) ||
                    await this.getDefaultParticipantOrder(payload.quizId);

                if (participantOrder.length === 0) {
                    client.emit('error', { message: 'No participants found for this quiz' });
                    return;
                }

                // Set first participant as active
                const firstParticipant = participantOrder[0];
                await this.redisService.setActiveParticipant(payload.quizId, firstParticipant.userId);

                this.server.to(payload.quizId).emit('roundStarted', {
                    roundId: payload.roundId,
                    quizType: round.quizType,
                    currentQuestion: clientQuestions[0],
                    activeUserId: firstParticipant.userId,
                    participantOrder,
                    timePerQuestion: round.timePerQuestion,
                    pointsPerCorrect: 1 // Sequential mode gives 1 point
                });
            }

            this.logger.log(`Round ${payload.roundId} started successfully for quiz ${payload.quizId} by ${userInfo.user.username} (${round.quizType} mode)`);

        } catch (error) {
            this.logger.error(`Failed to start round ${payload.roundId} for quiz ${payload.quizId}:`, error.message);
            client.emit('error', { message: 'Failed to start round', error: error.message });
        }
    }

    /**
     * Check if a round is ready to start and get question requirements
     * Only moderators can check round readiness
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('checkRoundReadiness')
    async handleCheckRoundReadiness(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { quizId: string; roundId: string }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo || userInfo.role !== 'MODERATOR') {
                this.logger.warn(`Non-moderator ${userInfo?.user.username || 'unknown'} attempted to check round readiness`);
                client.emit('error', { message: 'Only moderators can check round readiness' });
                return;
            }

            this.logger.log(`${userInfo.user.username} (${userInfo.role}) checking readiness for round ${payload.roundId}`);

            // Get round details
            const round = await this.prisma.round.findUnique({
                where: { id: payload.roundId },
                include: { quiz: true }
            });

            if (!round || round.quizId !== payload.quizId) {
                client.emit('error', { message: 'Round not found' });
                return;
            }

            // Use questions service to get detailed requirements
            const questionRequirements = await this.questionsService.getQuestionRequirements(payload.quizId);
            const availableQuestions = await this.questionsService.getQuestionsForRound(
                payload.quizId,
                round.quizType,
                undefined // No limit, get all available
            );

            const requiredForThisRound = Math.ceil(questionRequirements.requiredQuestions /
                (await this.prisma.round.count({ where: { quizId: payload.quizId } })));
            const isReady = availableQuestions.length >= requiredForThisRound;
            const shortage = Math.max(0, requiredForThisRound - availableQuestions.length);

            // Check if previous rounds are completed
            const previousRounds = await this.prisma.round.findMany({
                where: {
                    quizId: payload.quizId,
                    roundNumber: { lt: round.roundNumber }
                },
                orderBy: { roundNumber: 'asc' }
            });

            const incompletePreviousRounds = previousRounds.filter(r => !r.isActive && round.roundNumber > 1);
            const canStart = isReady && incompletePreviousRounds.length === 0;

            const response = {
                roundId: payload.roundId,
                roundNumber: round.roundNumber,
                quizType: round.quizType,
                isReady,
                canStart,
                questionRequirements: {
                    required: requiredForThisRound,
                    available: availableQuestions.length,
                    shortage,
                    overallRequirements: questionRequirements
                },
                prerequisites: {
                    previousRoundsCompleted: incompletePreviousRounds.length === 0,
                    incompletePreviousRounds: incompletePreviousRounds.map(r => ({
                        roundId: r.id,
                        roundNumber: r.roundNumber,
                        quizType: r.quizType
                    }))
                }
            };

            client.emit('roundReadinessCheck', response);

            this.logger.log(`Round ${payload.roundId} readiness: ${canStart ? 'READY' : 'NOT READY'} - ${availableQuestions.length}/${requiredForThisRound} questions`);

        } catch (error) {
            this.logger.error(`Failed to check round readiness:`, error.message);
            client.emit('error', {
                message: 'Failed to check round readiness',
                details: error.message
            });
        }
    }

    /**
     * Send a message to the quiz room (for debugging)
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('sendMessage')
    async handleSendMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { quizId: string; message: string }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo) {
                this.logger.warn(`Unauthenticated sendMessage attempt from client ${client.id}`);
                client.emit('error', { message: 'Authentication required' });
                return;
            }

            // Validate payload
            if (!payload || !payload.quizId || !payload.message || typeof payload.message !== 'string') {
                this.logger.warn(`Invalid sendMessage payload from ${userInfo.user.username}: ${JSON.stringify(payload)}`);
                client.emit('error', {
                    message: 'Invalid message format. QuizId and message are required.',
                    code: 'INVALID_PAYLOAD',
                    expectedFormat: { quizId: 'string', message: 'string' }
                });
                return;
            }

            // Check if user has joined this quiz room
            const userConnection = this.connectedUsers.get(client.id);
            if (!userConnection || userConnection.quizId !== payload.quizId) {
                client.emit('error', {
                    message: 'You must join the quiz room before sending messages',
                    code: 'NOT_IN_ROOM'
                });
                return;
            }

            this.logger.log(`${userInfo.user.username} (${userInfo.role}) sent message to quiz ${payload.quizId}: "${payload.message}"`);

            // Broadcast message to all users in the quiz room
            this.server.to(payload.quizId).emit('messageReceived', {
                messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                quizId: payload.quizId,
                userId: userInfo.userId,
                username: userInfo.user.username,
                role: userInfo.role,
                message: payload.message,
                timestamp: new Date().toISOString()
            });

            // Send confirmation to sender
            client.emit('messageSent', {
                success: true,
                quizId: payload.quizId,
                message: payload.message,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error(`Failed to send message from ${this.connectedUsers.get(client.id)?.user.username}:`, error.message);
            client.emit('error', {
                message: 'Failed to send message',
                code: 'SEND_FAILED',
                details: error.message
            });
        }
    }

    /**
     * Submit answer for simultaneous quiz mode
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('submitSimultaneousAnswer')
    async handleSubmitSimultaneousAnswer(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: {
            quizId: string;
            roundId: string;
            questionId: string;
            selectedIndex: number;
            questionNumber: number;
        }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo || userInfo.role !== 'CONTESTANT') {
                client.emit('error', { message: 'Only contestants can submit answers' });
                return;
            }

            // Process the answer
            const result = await this.processAnswer(
                payload.quizId,
                payload.roundId,
                userInfo.userId,
                payload.questionId,
                payload.selectedIndex
            );

            // Emit response to the specific user
            client.emit('answerSubmitted', {
                questionId: payload.questionId,
                questionNumber: payload.questionNumber,
                isCorrect: result.isCorrect,
                points: result.points,
                correctAnswerIndex: result.correctAnswerIndex
            });

            this.logger.log(`User ${userInfo.user.username} submitted answer for question ${payload.questionNumber} in simultaneous mode`);

        } catch (error) {
            this.logger.error(`Failed to submit simultaneous answer:`, error.message);
            client.emit('error', {
                message: 'Failed to submit answer',
                details: error.message
            });
        }
    }

    /**
     * Skip question in simultaneous mode
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('skipQuestion')
    async handleSkipQuestion(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: {
            quizId: string;
            roundId: string;
            questionNumber: number;
        }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo || userInfo.role !== 'CONTESTANT') {
                client.emit('error', { message: 'Only contestants can skip questions' });
                return;
            }

            // Emit skip confirmation to the user
            client.emit('questionSkipped', {
                questionNumber: payload.questionNumber,
                timestamp: new Date().toISOString()
            });

            this.logger.log(`User ${userInfo.user.username} skipped question ${payload.questionNumber}`);

        } catch (error) {
            this.logger.error(`Failed to skip question:`, error.message);
            client.emit('error', {
                message: 'Failed to skip question',
                details: error.message
            });
        }
    }

    /**
     * End simultaneous session for a user (when they complete all questions or time runs out)
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('endSimultaneousSession')
    async handleEndSimultaneousSession(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: {
            quizId: string;
            roundId: string;
        }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo || userInfo.role !== 'CONTESTANT') {
                client.emit('error', { message: 'Only contestants can end sessions' });
                return;
            }

            // Calculate final score for this round
            const roundScore = await this.calculateUserRoundScore(payload.quizId, payload.roundId, userInfo.userId);

            // Emit session ended with final score
            client.emit('simultaneousSessionEnded', {
                roundId: payload.roundId,
                finalScore: roundScore,
                timestamp: new Date().toISOString()
            });

            // Notify others that this user completed the round
            client.to(payload.quizId).emit('userCompletedRound', {
                userId: userInfo.userId,
                username: userInfo.user.username,
                score: roundScore
            });

            this.logger.log(`User ${userInfo.user.username} ended simultaneous session for round ${payload.roundId} with score ${roundScore}`);

        } catch (error) {
            this.logger.error(`Failed to end simultaneous session:`, error.message);
            client.emit('error', {
                message: 'Failed to end session',
                details: error.message
            });
        }
    }

    /**
     * Handle automatic answer confirmation after time limit for sequential mode
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('autoConfirmAnswer')
    async handleAutoConfirmAnswer(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: {
            quizId: string;
            roundId: string;
            questionId: string;
            selectedIndex: number;
        }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo || userInfo.role !== 'MODERATOR') {
                client.emit('error', { message: 'Only moderators can auto-confirm answers' });
                return;
            }

            // Get the active participant
            const activeUserId = await this.redisService.getActiveParticipant(payload.quizId);

            if (!activeUserId) {
                client.emit('error', { message: 'No active participant found' });
                return;
            }

            // Process the answer
            const result = await this.processAnswer(
                payload.quizId,
                payload.roundId,
                activeUserId,
                payload.questionId,
                payload.selectedIndex
            );

            // Broadcast the auto-confirmed answer result
            this.server.to(payload.quizId).emit('answerAutoConfirmed', {
                questionId: payload.questionId,
                userId: activeUserId,
                selectedIndex: payload.selectedIndex,
                isCorrect: result.isCorrect,
                points: result.points,
                correctAnswerIndex: result.correctAnswerIndex
            });

            // Proceed to next question/participant
            await this.proceedToNext(payload.quizId, payload.roundId, result.isCorrect);

            this.logger.log(`Auto-confirmed answer for user ${activeUserId} in question ${payload.questionId}`);

        } catch (error) {
            this.logger.error(`Failed to auto-confirm answer:`, error.message);
            client.emit('error', {
                message: 'Failed to auto-confirm answer',
                details: error.message
            });
        }
    }

    /**
     * Handle answer selection for sequential mode
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('selectAnswer')
    async handleSelectAnswer(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: {
            quizId: string;
            roundId: string;
            questionId: string;
            selectedIndex: number;
        }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo || userInfo.role !== 'CONTESTANT') {
                client.emit('error', { message: 'Only contestants can select answers' });
                return;
            }

            // Check if this user is the active participant
            const activeUserId = await this.redisService.getActiveParticipant(payload.quizId);
            if (activeUserId !== userInfo.userId) {
                client.emit('error', { message: 'Only the active participant can select an answer' });
                return;
            }

            // Store the selected answer temporarily (not processed yet)
            await this.redisService.storeSelectedAnswer(
                payload.quizId,
                payload.questionId,
                userInfo.userId,
                payload.selectedIndex
            );

            // Broadcast to all that an answer was selected (but not processed)
            this.server.to(payload.quizId).emit('answerSelected', {
                userId: userInfo.userId,
                questionId: payload.questionId,
                selectedIndex: payload.selectedIndex,
                username: userInfo.user.username
            });

            this.logger.log(`User ${userInfo.user.username} selected answer ${payload.selectedIndex} for question ${payload.questionId}`);

        } catch (error) {
            this.logger.error(`Failed to select answer:`, error.message);
            client.emit('error', {
                message: 'Failed to select answer',
                details: error.message
            });
        }
    }

    /**
     * Handle answer confirmation by moderator for sequential mode
     */
    @UseGuards(WsJwtGuard)
    @SubscribeMessage('confirmAnswer')
    async handleConfirmAnswer(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: {
            quizId: string;
            roundId: string;
            questionId: string;
        }
    ) {
        try {
            const userInfo = this.connectedUsers.get(client.id);

            if (!userInfo || userInfo.role !== 'MODERATOR') {
                client.emit('error', { message: 'Only moderators can confirm answers' });
                return;
            }

            // Get the selected answer
            const selectedAnswer = await this.redisService.getSelectedAnswer(payload.quizId, payload.questionId);
            if (!selectedAnswer) {
                client.emit('error', { message: 'No answer selected for this question' });
                return;
            }

            // Process the answer
            const result = await this.processAnswer(
                payload.quizId,
                payload.roundId,
                selectedAnswer.userId,
                payload.questionId,
                selectedAnswer.selectedIndex
            );

            // Clean up the temporary stored answer
            await this.redisService.clearSelectedAnswer(payload.quizId, payload.questionId);

            // Proceed to next question/participant
            await this.proceedToNext(payload.quizId, payload.roundId, result.isCorrect);

            this.logger.log(`Moderator confirmed answer for question ${payload.questionId}, result: ${result.isCorrect ? 'correct' : 'incorrect'}`);

        } catch (error) {
            this.logger.error(`Failed to confirm answer:`, error.message);
            client.emit('error', {
                message: 'Failed to confirm answer',
                details: error.message
            });
        }
    }

    // Helper methods

    /**
     * Process and validate an answer
     */
    private async processAnswer(quizId: string, roundId: string, userId: string, questionId: string, selectedIndex: number) {
        try {
            // Validate answer using cached data
            const validation = await this.redisService.validateAnswer(quizId, questionId, selectedIndex);

            // Determine points based on quiz type and bonus state
            const round = await this.prisma.round.findUnique({ where: { id: roundId } });
            const bonusState = this.bonusState.get(quizId);

            let points = 0;
            let answerType = 'normal';

            if (round?.quizType === 'simultaneous') {
                points = validation.isCorrect ? 5 : 0;
            } else {
                // Sequential mode: check if this is a bonus answer
                if (bonusState && bonusState.isActive && bonusState.bonusUserId === userId) {
                    // This is a bonus answer - worth 1 point
                    points = validation.isCorrect ? 1 : 0;
                    answerType = 'bonus';
                } else if (bonusState && !bonusState.isActive && bonusState.originalUserId === userId) {
                    // This is the original user returning after bonus - worth 2 point
                    points = validation.isCorrect ? 2 : 0;
                    answerType = 'original_return';

                    // Clear bonus state after original user answers
                    this.bonusState.delete(quizId);
                    await this.redisService.deleteQuizCache(quizId, 'bonusState');
                } else {
                    // Regular sequential answer - worth 2 point
                    points = validation.isCorrect ? 2 : 0;
                }
            }

            // Save response to database
            await this.quizService.submitResponse(userId, questionId, selectedIndex, round.id, points, validation.isCorrect);

            // Mark question as answered only for regular questions, not bonus
            if (answerType !== 'bonus') {
                await this.redisService.markQuestionAsAnswered(quizId, questionId);
            }

            // Broadcast result with answer type info
            this.server.to(quizId).emit('answerResult', {
                userId,
                questionId,
                isCorrect: validation.isCorrect,
                points,
                answerType,
                message: validation.isCorrect ? 'Correct!' : 'Incorrect!'
            });

            // Update leaderboard
            const leaderboard = await this.quizService.getQuizLeaderboard(quizId);
            this.server.to(quizId).emit('leaderboardUpdate', { leaderboard });

            // Auto-advance to next participant if original user just completed their question after bonus
            if (answerType === 'original_return') {
                // Small delay to allow UI to update, then auto-advance
                setTimeout(async () => {
                    await this.autoAdvanceAfterBonus(quizId, roundId);
                }, 1000); // 1 second delay
            }

            // Return result for API consumers
            return {
                isCorrect: validation.isCorrect,
                points,
                correctAnswerIndex: validation.correctAnswerIndex,
                answerType
            };

        } catch (error) {
            this.logger.error('Error processing answer:', error.message);
            throw error;
        }
    }

    /**
     * Get questions suitable for a round type with proper validation
     */
    private async getQuestionsForRound(quizId: string, quizType: string): Promise<any[]> {
        try {
            // First, validate that we have enough questions for this round
            const quiz = await this.prisma.quiz.findUnique({
                where: { id: quizId },
                include: {
                    participantOrders: true,
                    questions: {
                        where: {
                            questionType: quizType as any,
                            isAnswered: false
                        },
                        orderBy: { questionNumber: 'asc' }
                    }
                }
            });

            if (!quiz) {
                throw new Error('Quiz not found');
            }

            // Calculate required questions based on participant count and quiz settings
            const participantCount = quiz.participantOrders.length;

            // Default values if not set in quiz
            const questionsPerParticipant = 3; // Can be made configurable later
            const bufferQuestions = 5; // Extra questions as buffer

            const requiredQuestions = (participantCount * questionsPerParticipant) + bufferQuestions;
            const availableQuestions = quiz.questions.length;

            this.logger.log(`Quiz ${quizId}: Need ${requiredQuestions} ${quizType} questions, have ${availableQuestions}`);

            if (availableQuestions < requiredQuestions) {
                const shortage = requiredQuestions - availableQuestions;
                throw new Error(`Insufficient questions for this round. Need ${shortage} more ${quizType} questions.`);
            }

            // Get unanswered questions for this quiz type
            const questions = await this.prisma.question.findMany({
                where: {
                    quizId,
                    questionType: quizType as any,
                    isAnswered: false
                },
                orderBy: { questionNumber: 'asc' },
                take: requiredQuestions // Only take the number we need
            });

            this.logger.log(`Retrieved ${questions.length} ${quizType} questions for quiz ${quizId}`);
            return questions;

        } catch (error) {
            this.logger.error(`Error getting questions for round ${quizId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get default participant order from database
     */
    private async getDefaultParticipantOrder(quizId: string): Promise<any[]> {
        const participants = await this.prisma.participantOrder.findMany({
            where: { quizId },
            include: { user: { select: { username: true } } },
            orderBy: { orderIndex: 'asc' }
        });

        if (participants.length === 0) {
            // Create default order based on quiz users
            const users = await this.prisma.user.findMany({
                where: { quizId, role: 'CONTESTANT' },
                select: { id: true, username: true }
            });

            const defaultOrder = users.map((user, index) => ({
                userId: user.id,
                username: user.username,
                orderIndex: index
            }));

            // Save to database
            await this.prisma.participantOrder.createMany({
                data: defaultOrder.map(p => ({
                    quizId,
                    userId: p.userId,
                    orderIndex: p.orderIndex
                }))
            });

            return defaultOrder;
        }

        return participants.map(p => ({
            userId: p.userId,
            username: p.user.username,
            orderIndex: p.orderIndex
        }));
    }

    /**
     * Auto-advance to next participant after original user completes their question post-bonus
     */
    private async autoAdvanceAfterBonus(quizId: string, roundId: string) {
        try {
            // Check if there's a completed bonus state
            const bonusState = this.bonusState.get(quizId);
            if (bonusState && !bonusState.isActive) {
                // Bonus flow is complete, auto-advance to next participant
                this.logger.log(`Auto-advancing to next participant after bonus completion for quiz ${quizId}`);

                // Get current state
                const participantOrder = await this.redisService.getParticipantOrder(quizId);
                const currentActiveUserId = await this.redisService.getActiveParticipant(quizId);
                const currentQuestionIndex = await this.redisService.getCurrentQuestionIndex(quizId, roundId) || 0;

                // Find current participant index
                const currentParticipantIndex = participantOrder.findIndex(p => p.userId === currentActiveUserId);

                // Move to next participant
                const nextParticipantIndex = (currentParticipantIndex + 1) % participantOrder.length;
                const nextParticipant = participantOrder[nextParticipantIndex];

                // If we've cycled through all participants, move to next question
                let nextQuestionIndex = currentQuestionIndex;
                if (nextParticipantIndex === 0) {
                    nextQuestionIndex++;
                }

                // Get questions for this round
                const questions = await this.redisService.getRoundQuestions(quizId, roundId);

                if (nextQuestionIndex >= questions.length) {
                    // Round is complete
                    await this.prisma.round.update({
                        where: { id: roundId },
                        data: { isActive: false }
                    });

                    this.server.to(quizId).emit('roundCompleted', {
                        roundId: roundId
                    });
                    return;
                }

                // Update active participant and question index
                await this.redisService.setActiveParticipant(quizId, nextParticipant.userId);
                await this.redisService.setCurrentQuestionIndex(quizId, roundId, nextQuestionIndex);

                const nextQuestion = questions[nextQuestionIndex];

                this.server.to(quizId).emit('nextParticipant', {
                    activeUserId: nextParticipant.userId,
                    currentQuestion: {
                        id: nextQuestion.id,
                        questionText: nextQuestion.questionText,
                        options: nextQuestion.options,
                        questionNumber: nextQuestion.questionNumber
                    },
                    questionIndex: nextQuestionIndex
                });

                this.logger.log(`Auto-advanced to participant ${nextParticipant.userId} with question ${nextQuestionIndex + 1}`);
            }
        } catch (error) {
            this.logger.error('Error auto-advancing after bonus:', error.message);
        }
    }

    /**
     * Get participant count for a quiz
     */
    private async getParticipantCount(quizId: string): Promise<number> {
        const quiz = await this.prisma.quiz.findUnique({
            where: { id: quizId },
            include: {
                participantOrders: true,
                users: { where: { role: 'CONTESTANT' } }
            }
        });

        if (!quiz) {
            return 1; // Default to 1 participant
        }

        return Math.max(quiz.participantOrders.length, quiz.users.length, 1);
    }

    /**
     * Calculate user's total score for a specific round
     */
    private async calculateUserRoundScore(quizId: string, roundId: string, userId: string): Promise<number> {
        const responses = await this.prisma.response.findMany({
            where: {
                quizId,
                roundId,
                userId
            }
        });

        return responses.reduce((total, response) => total + response.pointsEarned, 0);
    }

    /**
     * Proceed to next question/participant in sequential mode
     */
    private async proceedToNext(quizId: string, roundId: string, wasCorrect: boolean): Promise<void> {
        try {
            const participantOrder = await this.redisService.getParticipantOrder(quizId);
            const currentQuestionIndex = await this.redisService.getCurrentQuestionIndex(quizId, roundId);
            const activeUserId = await this.redisService.getActiveParticipant(quizId);

            if (!participantOrder || !activeUserId) {
                return;
            }

            const currentParticipantIndex = participantOrder.findIndex(p => p.userId === activeUserId);

            // Move to next participant
            const nextParticipantIndex = (currentParticipantIndex + 1) % participantOrder.length;
            const nextParticipant = participantOrder[nextParticipantIndex];

            // If we've cycled through all participants, move to next question
            let nextQuestionIndex = currentQuestionIndex;
            if (nextParticipantIndex === 0) {
                nextQuestionIndex++;
            }

            // Get questions for this round
            const questions = await this.redisService.getRoundQuestions(quizId, roundId);

            if (nextQuestionIndex >= questions.length) {
                // Round is complete
                await this.prisma.round.update({
                    where: { id: roundId },
                    data: { isActive: false }
                });

                this.server.to(quizId).emit('roundCompleted', {
                    roundId: roundId
                });
                return;
            }

            // Update active participant and question index
            await this.redisService.setActiveParticipant(quizId, nextParticipant.userId);
            await this.redisService.setCurrentQuestionIndex(quizId, roundId, nextQuestionIndex);

            const nextQuestion = questions[nextQuestionIndex];

            this.server.to(quizId).emit('nextParticipant', {
                activeUserId: nextParticipant.userId,
                currentQuestion: {
                    id: nextQuestion.id,
                    questionText: nextQuestion.questionText,
                    options: nextQuestion.options,
                    questionNumber: nextQuestion.questionNumber
                },
                questionIndex: nextQuestionIndex
            });

        } catch (error) {
            this.logger.error('Error proceeding to next:', error.message);
        }
    }
}
