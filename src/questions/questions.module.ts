import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { QuestionsController } from './questions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MulterModule } from '@nestjs/platform-express';

@Module({
    imports: [
        PrismaModule,
        MulterModule.register({
            limits: {
                fileSize: 10 * 1024 * 1024, // 10MB limit
            },
        }),
    ],
    controllers: [QuestionsController],
    providers: [QuestionsService],
    exports: [QuestionsService],
})
export class QuestionsModule { }
