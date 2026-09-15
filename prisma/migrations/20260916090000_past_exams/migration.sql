-- CreateEnum
CREATE TYPE "ExamPaperStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'REVIEW', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "DraftOrigin" AS ENUM ('EXTRACTED', 'GENERATED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "examPaperId" TEXT,
ADD COLUMN     "figurePath" TEXT,
ADD COLUMN     "questionNumber" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "examBoardId" TEXT,
    "year" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "answerKeyUrl" TEXT,
    "fileHash" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "answerKeyPath" TEXT,
    "answerKey" JSONB,
    "geminiFileUri" TEXT,
    "geminiFileAt" TIMESTAMP(3),
    "status" "ExamPaperStatus" NOT NULL DEFAULT 'UPLOADED',
    "statusNote" TEXT,
    "expectedCount" INTEGER,
    "extractedUpTo" INTEGER NOT NULL DEFAULT 0,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionDraft" (
    "id" TEXT NOT NULL,
    "origin" "DraftOrigin" NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "competitionId" TEXT NOT NULL,
    "examPaperId" TEXT,
    "number" INTEGER,
    "statement" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctLabel" TEXT,
    "explanation" TEXT,
    "subjectId" TEXT,
    "topicId" TEXT,
    "difficulty" "Difficulty",
    "hasFigure" BOOLEAN NOT NULL DEFAULT false,
    "figureNote" TEXT,
    "figurePath" TEXT,
    "issues" TEXT[],
    "aiModel" TEXT NOT NULL,
    "verification" JSONB,
    "questionId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_fileHash_key" ON "ExamPaper"("fileHash");

-- CreateIndex
CREATE INDEX "ExamPaper_status_idx" ON "ExamPaper"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_competitionId_year_version_key" ON "ExamPaper"("competitionId", "year", "version");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionDraft_questionId_key" ON "QuestionDraft"("questionId");

-- CreateIndex
CREATE INDEX "QuestionDraft_status_competitionId_idx" ON "QuestionDraft"("status", "competitionId");

-- CreateIndex
CREATE INDEX "QuestionDraft_examPaperId_number_idx" ON "QuestionDraft"("examPaperId", "number");

-- CreateIndex
CREATE INDEX "Question_examPaperId_questionNumber_idx" ON "Question"("examPaperId", "questionNumber");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_examPaperId_fkey" FOREIGN KEY ("examPaperId") REFERENCES "ExamPaper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_examBoardId_fkey" FOREIGN KEY ("examBoardId") REFERENCES "ExamBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDraft" ADD CONSTRAINT "QuestionDraft_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDraft" ADD CONSTRAINT "QuestionDraft_examPaperId_fkey" FOREIGN KEY ("examPaperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDraft" ADD CONSTRAINT "QuestionDraft_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

