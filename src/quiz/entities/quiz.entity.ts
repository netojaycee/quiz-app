export class Quiz {
    id: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    winnerId?: string; // ID of the winning user/team
}

export class Contestant {
    id: string;
    name: string;
    location?: string;
    userId: string; // Team leader
    quizId: string;
    joinedAt: Date;
    isActive: boolean;
}
