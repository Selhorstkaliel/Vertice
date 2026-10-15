-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('ESSAY_CORRECTION', 'ESSAY_REWRITE', 'ESSAY_THEME', 'MENTOR', 'QUESTION_AI');

-- CreateEnum
CREATE TYPE "EssayThemeOrigin" AS ENUM ('OFFICIAL', 'GENERATED');

-- CreateEnum
CREATE TYPE "EssayThemeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EssayStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CORRECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ESSAY';

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "batch" BOOLEAN NOT NULL DEFAULT false,
    "costUsd" DOUBLE PRECISION,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EssayRubric" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "year" INTEGER,
    "editalUrl" TEXT,
    "textType" TEXT NOT NULL,
    "minLines" INTEGER,
    "maxLines" INTEGER,
    "charsPerLine" INTEGER NOT NULL DEFAULT 70,
    "criteria" JSONB NOT NULL,
    "zeroingRules" TEXT[],
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EssayRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EssayTheme" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "supportTexts" JSONB NOT NULL,
    "origin" "EssayThemeOrigin" NOT NULL,
    "year" INTEGER,
    "status" "EssayThemeStatus" NOT NULL DEFAULT 'DRAFT',
    "aiModel" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EssayTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Essay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "themeId" TEXT,
    "rubricId" TEXT NOT NULL,
    "originalId" TEXT,
    "text" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedLines" INTEGER NOT NULL DEFAULT 0,
    "timeSpentSec" INTEGER,
    "timed" BOOLEAN NOT NULL DEFAULT false,
    "status" "EssayStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "correctedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Essay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EssayCorrection" (
    "id" TEXT NOT NULL,
    "essayId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "topIssues" JSONB NOT NULL,
    "exercise" JSONB,
    "runs" JSONB NOT NULL,
    "totalMin" DOUBLE PRECISION NOT NULL,
    "totalMax" DOUBLE PRECISION NOT NULL,
    "totalMid" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "disagreement" DOUBLE PRECISION NOT NULL,
    "uncertain" BOOLEAN NOT NULL DEFAULT false,
    "zeroFlag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EssayCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EssayParagraphRewrite" (
    "id" TEXT NOT NULL,
    "essayId" TEXT NOT NULL,
    "paragraphIndex" INTEGER NOT NULL,
    "criterionKey" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "newText" TEXT NOT NULL,
    "feedback" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EssayParagraphRewrite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EssayThemeBatch" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requests" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdById" TEXT,
    "collectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EssayThemeBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_feature_createdAt_idx" ON "AiUsage"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_userId_feature_createdAt_idx" ON "AiUsage"("userId", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "EssayRubric_competitionId_publishedAt_idx" ON "EssayRubric"("competitionId", "publishedAt");

-- CreateIndex
CREATE INDEX "EssayTheme_competitionId_status_idx" ON "EssayTheme"("competitionId", "status");

-- CreateIndex
CREATE INDEX "Essay_userId_createdAt_idx" ON "Essay"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Essay_userId_status_idx" ON "Essay"("userId", "status");

-- CreateIndex
CREATE INDEX "EssayCorrection_essayId_createdAt_idx" ON "EssayCorrection"("essayId", "createdAt");

-- CreateIndex
CREATE INDEX "EssayParagraphRewrite_essayId_createdAt_idx" ON "EssayParagraphRewrite"("essayId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EssayThemeBatch_batchId_key" ON "EssayThemeBatch"("batchId");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssayRubric" ADD CONSTRAINT "EssayRubric_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssayRubric" ADD CONSTRAINT "EssayRubric_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssayTheme" ADD CONSTRAINT "EssayTheme_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssayTheme" ADD CONSTRAINT "EssayTheme_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Essay" ADD CONSTRAINT "Essay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Essay" ADD CONSTRAINT "Essay_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "EssayTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Essay" ADD CONSTRAINT "Essay_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "EssayRubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Essay" ADD CONSTRAINT "Essay_originalId_fkey" FOREIGN KEY ("originalId") REFERENCES "Essay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssayCorrection" ADD CONSTRAINT "EssayCorrection_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "Essay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EssayParagraphRewrite" ADD CONSTRAINT "EssayParagraphRewrite_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "Essay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
