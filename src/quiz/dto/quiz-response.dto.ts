import { Exclude, Expose, Type } from 'class-transformer';

export class RoundResponseDto {
    @Expose()
    id: string;

    @Expose()
    roundNumber: number;

    @Expose()
    quizType: string;

    @Expose()
    timePerQuestion?: number;

    @Expose()
    isActive: boolean;

    @Expose()
    createdAt: Date;
}

export class ContestantResponseDto {
    @Expose()
    id: string;

    @Expose()
    name: string;

    @Expose()
    location?: string;

    @Expose()
    userId: string;

    @Expose()
    joinedAt: Date;

    @Expose()
    isActive: boolean;

    @Expose()
    user: {
        id: string;
        username: string;
        role: string;
    };
}

export class QuizPositionResponseDto {
    @Expose()
    id: string;

    @Expose()
    userId: string;

    @Expose()
    position: number;

    @Expose()
    totalScore: number;

    @Expose()
    completedAt: Date;

    @Expose()
    user: {
        id: string;
        username: string;
    };
}

export class QuizResponseDto {
    @Expose()
    id: string;

    @Expose()
    name: string;

    @Expose()
    isActive: boolean;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;

    @Expose()
    winnerId?: string;

    @Expose()
    @Type(() => RoundResponseDto)
    rounds: RoundResponseDto[];

    @Expose()
    @Type(() => ContestantResponseDto)
    contestants: ContestantResponseDto[];

    @Expose()
    @Type(() => QuizPositionResponseDto)
    positions: QuizPositionResponseDto[];
}
