/*
  Warnings:

  - The `questionType` column on the `Question` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('multiple_choice', 'yes_no');

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "questionType",
ADD COLUMN     "questionType" "QuestionType" NOT NULL DEFAULT 'multiple_choice';

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "questionsPerParticipant" INTEGER NOT NULL DEFAULT 3;

-- CreateIndex
CREATE INDEX "Question_quizId_questionType_isAnswered_idx" ON "Question"("quizId", "questionType", "isAnswered");
