/*
  Warnings:

  - You are about to drop the column `roundId` on the `Contestant` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `Score` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name,userId,quizId]` on the table `Contestant` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,questionId]` on the table `Response` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `Contestant` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Contestant" DROP CONSTRAINT "Contestant_roundId_fkey";

-- DropIndex
DROP INDEX "Contestant_userId_quizId_key";

-- AlterTable
ALTER TABLE "Contestant" DROP COLUMN "roundId",
ADD COLUMN     "location" TEXT,
ADD COLUMN     "name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "pointsEarned" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Score" DROP COLUMN "score",
ADD COLUMN     "questionsAnswered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "questionsCorrect" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "roundScore" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Contestant_name_userId_quizId_key" ON "Contestant"("name", "userId", "quizId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_userId_questionId_key" ON "Response"("userId", "questionId");
