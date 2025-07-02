/*
  Warnings:

  - You are about to drop the column `book` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `chapter` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `points` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `roundId` on the `Question` table. All the data in the column will be lost.
  - The `quizType` column on the `Round` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updatedAt` to the `Question` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "QuizType" AS ENUM ('multiple_choice', 'yes_no', 'simultaneous');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard');

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_roundId_fkey";

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "book",
DROP COLUMN "chapter",
DROP COLUMN "points",
DROP COLUMN "roundId",
ADD COLUMN     "difficulty" "Difficulty" DEFAULT 'medium',
ADD COLUMN     "questionType" "QuizType" NOT NULL DEFAULT 'multiple_choice',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Round" DROP COLUMN "quizType",
ADD COLUMN     "quizType" "QuizType" NOT NULL DEFAULT 'multiple_choice';

-- CreateIndex
CREATE INDEX "Question_quizId_questionType_isAnswered_idx" ON "Question"("quizId", "questionType", "isAnswered");

-- CreateIndex
CREATE INDEX "Question_quizId_isAnswered_idx" ON "Question"("quizId", "isAnswered");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
