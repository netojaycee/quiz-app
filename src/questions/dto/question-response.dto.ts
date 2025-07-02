export class QuestionResponseDto {
    id: string;
    quizId: string;
    questionNumber: number;
    questionText: string;
    questionType: string;
    options: string[];
    correctAnswerIndex: number;
    isAnswered: boolean;
    difficulty?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class QuestionStatsDto {
    totalQuestions: number;
    answeredQuestions: number;
    unansweredQuestions: number;
    questionsByType: {
        multiple_choice: number;
        yes_no: number;
    };
    unansweredByType: {
        multiple_choice: number;
        yes_no: number;
    };
}

export class QuestionRequirementsDto {
    requiredQuestions: number;
    currentQuestions: number;
    shortfall: number;
    questionsByType: {
        multiple_choice: {
            required: number;
            current: number;
            shortfall: number;
        };
        yes_no: {
            required: number;
            current: number;
            shortfall: number;
        };
    };
}
