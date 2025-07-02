/*
  Warnings:

  - A unique constraint covering the columns `[quizId,questionNumber]` on the table `Question` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'AUDIENCE';

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_roundId_fkey";

-- DropIndex
DROP INDEX "Question_quizId_roundId_questionNumber_key";

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "isAnswered" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "roundId" DROP NOT NULL,
ALTER COLUMN "book" DROP NOT NULL,
ALTER COLUMN "chapter" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ParticipantOrder" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantOrder_quizId_userId_key" ON "ParticipantOrder"("quizId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantOrder_quizId_orderIndex_key" ON "ParticipantOrder"("quizId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Question_quizId_questionNumber_key" ON "Question"("quizId", "questionNumber");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantOrder" ADD CONSTRAINT "ParticipantOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantOrder" ADD CONSTRAINT "ParticipantOrder_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
