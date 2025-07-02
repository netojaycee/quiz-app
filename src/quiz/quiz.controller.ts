import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { CreateQuizDto, CreateContestantDto, CreateUserWithContestantsDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('quiz')
export class QuizController {
    constructor(private readonly quizService: QuizService) { }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.MODERATOR)
    @HttpCode(HttpStatus.CREATED)
    create(@Body() createQuizDto: CreateQuizDto, @GetUser('id') moderatorId: string) {
        return this.quizService.create(createQuizDto, moderatorId);
    }

    @Get()
    findAll() {
        return this.quizService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.quizService.findOne(id);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.MODERATOR)
    update(
        @Param('id') id: string,
        @Body() updateQuizDto: UpdateQuizDto,
        @GetUser('id') userId: string
    ) {
        return this.quizService.update(id, updateQuizDto, userId);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.MODERATOR)
    @HttpCode(HttpStatus.OK)
    remove(@Param('id') id: string) {
        return this.quizService.remove(id);
    }

    // Additional endpoints for managing contestants
    @Post(':id/contestants')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.MODERATOR)
    @HttpCode(HttpStatus.OK)
    addContestants(
        @Param('id') id: string,
        @Body() body: { contestants: CreateContestantDto[] },
        @GetUser('id') userId: string,
    ) {
        return this.quizService.addContestants(id, userId, body.contestants);
    }

    @Delete(':id/contestants/:contestantId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.MODERATOR)
    @HttpCode(HttpStatus.OK)
    removeContestant(
        @Param('id') id: string,
        @Param('contestantId') contestantId: string,
    ) {
        return this.quizService.removeContestant(id, contestantId);
    }

    @Patch(':id/winner')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.MODERATOR)
    @HttpCode(HttpStatus.OK)
    setWinner(
        @Param('id') id: string,
        @Body() body: { winnerId: string },
    ) {
        return this.quizService.setWinner(id, body.winnerId);
    }
}
