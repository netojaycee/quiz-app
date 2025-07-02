import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SocketModule } from './socket/socket.module';
import { QuizModule } from './quiz/quiz.module';
import { QuestionsModule } from './questions/questions.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RedisModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    SocketModule,
    QuizModule,
    QuestionsModule,
  ],
})
export class AppModule { }
