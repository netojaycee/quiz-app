import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Redis service for caching quiz data during active sessions
 * 
 * Key patterns:
 * - quiz:{quizId}:questions - All questions for a quiz
 * - quiz:{quizId}:round:{roundId}:questions - Questions for a specific round
 * - quiz:{quizId}:participants - Participant order
 * - quiz:{quizId}:active_participant - Current active participant
 * - quiz:{quizId}:current_question - Current question index
 */
@Injectable()
export class RedisService {
    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) { }

    /**
     * Cache all questions for a quiz at the start of the session
     */
    async cacheQuizQuestions(quizId: string, questions: any[]): Promise<void> {
        const key = `quiz:${quizId}:questions`;
        await this.cacheManager.set(key, questions, 60 * 60); // 1 hour TTL
    }

    /**
     * Get cached questions for a quiz
     */
    async getQuizQuestions(quizId: string): Promise<any[] | null> {
        const key = `quiz:${quizId}:questions`;
        return await this.cacheManager.get(key);
    }

    /**
     * Cache questions suitable for a specific round type
     */
    async cacheRoundQuestions(quizId: string, roundId: string, questions: any[]): Promise<void> {
        const key = `quiz:${quizId}:round:${roundId}:questions`;
        await this.cacheManager.set(key, questions, 60 * 60);
    }

    /**
     * Get cached questions for a specific round
     */
    async getRoundQuestions(quizId: string, roundId: string): Promise<any[] | null> {
        const key = `quiz:${quizId}:round:${roundId}:questions`;
        return await this.cacheManager.get(key);
    }

    /**
     * Cache participant order for the quiz
     */
    async cacheParticipantOrder(quizId: string, participantOrder: any[]): Promise<void> {
        const key = `quiz:${quizId}:participants`;
        await this.cacheManager.set(key, participantOrder, 60 * 60);
    }

    /**
     * Get cached participant order
     */
    async getParticipantOrder(quizId: string): Promise<any[] | null> {
        const key = `quiz:${quizId}:participants`;
        return await this.cacheManager.get(key);
    }

    /**
     * Set the current active participant
     */
    async setActiveParticipant(quizId: string, userId: string): Promise<void> {
        const key = `quiz:${quizId}:active_participant`;
        await this.cacheManager.set(key, userId, 60 * 60);
    }

    /**
     * Get the current active participant
     */
    async getActiveParticipant(quizId: string): Promise<string | null> {
        const key = `quiz:${quizId}:active_participant`;
        return await this.cacheManager.get(key);
    }

    /**
     * Set current question index for a round
     */
    async setCurrentQuestionIndex(quizId: string, roundId: string, index: number): Promise<void> {
        const key = `quiz:${quizId}:round:${roundId}:current_question`;
        await this.cacheManager.set(key, index, 60 * 60);
    }

    /**
     * Get current question index for a round
     */
    async getCurrentQuestionIndex(quizId: string, roundId: string): Promise<number | null> {
        const key = `quiz:${quizId}:round:${roundId}:current_question`;
        return await this.cacheManager.get(key);
    }

    /**
     * Mark a question as answered to avoid repetition
     */
    async markQuestionAsAnswered(quizId: string, questionId: string): Promise<void> {
        const key = `quiz:${quizId}:answered_questions`;
        const answeredQuestions: string[] = await this.cacheManager.get(key) || [];
        if (!answeredQuestions.includes(questionId)) {
            answeredQuestions.push(questionId);
            await this.cacheManager.set(key, answeredQuestions, 60 * 60);
        }
    }

    /**
     * Get list of answered questions
     */
    async getAnsweredQuestions(quizId: string): Promise<string[]> {
        const key = `quiz:${quizId}:answered_questions`;
        return await this.cacheManager.get(key) || [];
    }

    /**
     * Validate answer from cached question data
     */
    async validateAnswer(quizId: string, questionId: string, selectedIndex: number): Promise<{ isCorrect: boolean; points: number; correctAnswerIndex: number }> {
        const questions = await this.getQuizQuestions(quizId);
        if (!questions) {
            throw new Error('Questions not cached for this quiz');
        }

        const question = questions.find(q => q.id === questionId);
        if (!question) {
            throw new Error('Question not found in cache');
        }

        const isCorrect = selectedIndex === question.correctAnswerIndex;
        return {
            isCorrect,
            points: isCorrect ? question.points : 0,
            correctAnswerIndex: question.correctAnswerIndex
        };
    }

    /**
     * Clear all cache for a quiz (when quiz ends)
     */
    async clearQuizCache(quizId: string): Promise<void> {
        const keys = [
            `quiz:${quizId}:questions`,
            `quiz:${quizId}:participants`,
            `quiz:${quizId}:active_participant`,
            `quiz:${quizId}:answered_questions`
        ];

        for (const key of keys) {
            await this.cacheManager.del(key);
        }
    }

    /**
     * Store quiz session state
     */
    async setQuizSession(quizId: string, sessionData: any): Promise<void> {
        const key = `quiz:${quizId}:session`;
        await this.cacheManager.set(key, sessionData, 60 * 60);
    }

    /**
     * Get quiz session state
     */
    async getQuizSession(quizId: string): Promise<any | null> {
        const key = `quiz:${quizId}:session`;
        return await this.cacheManager.get(key);
    }

    /**
     * Generic method to set quiz-related cache data
     */
    async setQuizCache(quizId: string, key: string, data: any): Promise<void> {
        const cacheKey = `quiz:${quizId}:${key}`;
        await this.cacheManager.set(cacheKey, data, 60 * 60);
    }

    /**
     * Generic method to get quiz-related cache data
     */
    async getQuizCache(quizId: string, key: string): Promise<any | null> {
        const cacheKey = `quiz:${quizId}:${key}`;
        return await this.cacheManager.get(cacheKey);
    }

    /**
     * Generic method to delete quiz-related cache data
     */
    async deleteQuizCache(quizId: string, key: string): Promise<void> {
        const cacheKey = `quiz:${quizId}:${key}`;
        await this.cacheManager.del(cacheKey);
    }

    /**
     * Store pending answer for moderator confirmation
     */
    async setPendingAnswer(quizId: string, userId: string, answerData: any): Promise<void> {
        const key = `quiz:${quizId}:pending_answer:${userId}`;
        await this.cacheManager.set(key, answerData, 60 * 5); // 5 minutes TTL
    }

    /**
     * Get pending answer
     */
    async getPendingAnswer(quizId: string, userId: string): Promise<any | null> {
        const key = `quiz:${quizId}:pending_answer:${userId}`;
        return await this.cacheManager.get(key);
    }

    /**
     * Delete pending answer
     */
    async deletePendingAnswer(quizId: string, userId: string): Promise<void> {
        const key = `quiz:${quizId}:pending_answer:${userId}`;
        await this.cacheManager.del(key);
    }

    /**
     * Store selected answer temporarily for confirmation
     */
    async storeSelectedAnswer(quizId: string, questionId: string, userId: string, selectedIndex: number): Promise<void> {
        const key = `quiz:${quizId}:selected_answer:${questionId}`;
        const answerData = {
            userId,
            selectedIndex,
            timestamp: new Date().toISOString()
        };
        await this.cacheManager.set(key, answerData, 60 * 5); // 5 minutes TTL
    }

    /**
     * Get selected answer
     */
    async getSelectedAnswer(quizId: string, questionId: string): Promise<{ userId: string; selectedIndex: number; timestamp: string } | null> {
        const key = `quiz:${quizId}:selected_answer:${questionId}`;
        return await this.cacheManager.get(key);
    }

    /**
     * Clear selected answer
     */
    async clearSelectedAnswer(quizId: string, questionId: string): Promise<void> {
        const key = `quiz:${quizId}:selected_answer:${questionId}`;
        await this.cacheManager.del(key);
    }

    /**
     * Store answered question for a specific round
     */
    async storeAnsweredQuestion(quizId: string, roundId: string, questionId: string, userId: string): Promise<void> {
        // Store globally answered question for this round
        const key = `quiz:${quizId}:round:${roundId}:answered_questions`;
        const answeredQuestions: string[] = await this.cacheManager.get(key) || [];
        if (!answeredQuestions.includes(questionId)) {
            answeredQuestions.push(questionId);
            await this.cacheManager.set(key, answeredQuestions, 60 * 60);
        }

        // Store participant-specific answered question
        const participantKey = `quiz:${quizId}:round:${roundId}:participant:${userId}:answered_questions`;
        const participantAnsweredQuestions: string[] = await this.cacheManager.get(participantKey) || [];
        if (!participantAnsweredQuestions.includes(questionId)) {
            participantAnsweredQuestions.push(questionId);
            await this.cacheManager.set(participantKey, participantAnsweredQuestions, 60 * 60);

            // Increment participant question count
            await this.incrementParticipantQuestionCount(quizId, roundId, userId);
        }
    }

    /**
     * Get all answered questions for a specific round
     */
    async getAnsweredQuestionIds(quizId: string, roundId: string): Promise<string[]> {
        const key = `quiz:${quizId}:round:${roundId}:answered_questions`;
        return await this.cacheManager.get(key) || [];
    }

    /**
     * Get questions answered by a specific participant in a round
     */
    async getParticipantAnsweredQuestions(quizId: string, roundId: string, userId: string): Promise<string[]> {
        const key = `quiz:${quizId}:round:${roundId}:participant:${userId}:answered_questions`;
        return await this.cacheManager.get(key) || [];
    }

    /**
     * Increment the count of questions answered by a participant
     */
    async incrementParticipantQuestionCount(quizId: string, roundId: string, userId: string): Promise<number> {
        const key = `quiz:${quizId}:round:${roundId}:participant:${userId}:question_count`;
        const currentCount: number = await this.cacheManager.get(key) || 0;
        const newCount = currentCount + 1;
        await this.cacheManager.set(key, newCount, 60 * 60);
        return newCount;
    }

    /**
     * Get the count of questions answered by a participant
     */
    async getParticipantQuestionCount(quizId: string, roundId: string, userId: string): Promise<number> {
        const key = `quiz:${quizId}:round:${roundId}:participant:${userId}:question_count`;
        return await this.cacheManager.get(key) || 0;
    }
}
