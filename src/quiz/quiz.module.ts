import { Module } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { QuizGateway } from './quiz.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '@/users/users.module';
import { QuestionsModule } from '@/questions/questions.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/redis/redis.service';

@Module({
    imports: [
        PrismaModule,
        UsersModule,
        QuestionsModule,
        JwtModule.registerAsync({
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: '24h' },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [QuizController],
    providers: [QuizService, QuizGateway, RedisService],
    exports: [QuizService, QuizGateway],
})
export class QuizModule { }
