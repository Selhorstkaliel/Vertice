-- CreateEnum
CREATE TYPE "EditalSourceKind" AS ENUM ('LINK_LIST', 'INDEX', 'BROWSER_ONLY');

-- CreateEnum
CREATE TYPE "EditalDocType" AS ENUM ('EDITAL', 'RETIFICACAO', 'CONVOCACAO', 'RESULTADO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EditalDocStatus" AS ENUM ('NEW', 'READING', 'REVIEW', 'PUBLISHED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "EditalReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'EDITAL_READING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'EDITAL_DOCUMENT';
ALTER TYPE "NotificationType" ADD VALUE 'EDITAL_UPDATE';

-- AlterTable
ALTER TABLE "StudentCompetition" ADD COLUMN     "keepCustomExamDate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EditalSource" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "EditalSourceKind" NOT NULL,
    "filter" TEXT,
    "follow" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastNewDocumentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastLinkCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditalSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditalDocument" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "competitionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" DATE,
    "type" "EditalDocType" NOT NULL DEFAULT 'OUTRO',
    "typedBy" TEXT NOT NULL DEFAULT 'regras',
    "status" "EditalDocStatus" NOT NULL DEFAULT 'NEW',
    "statusNote" TEXT,
    "fileHash" TEXT,
    "filePath" TEXT,
    "pageCount" INTEGER,
    "baseline" BOOLEAN NOT NULL DEFAULT false,
    "aiRequests" INTEGER NOT NULL DEFAULT 0,
    "progress" JSONB,
    "geminiFileUri" TEXT,
    "geminiFileAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditalExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "issues" TEXT[],
    "model" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditalExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditalChange" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "page" INTEGER,
    "quote" TEXT,
    "status" "EditalReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditalChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EditalSource_competitionId_url_key" ON "EditalSource"("competitionId", "url");

-- CreateIndex
CREATE INDEX "EditalDocument_fileHash_idx" ON "EditalDocument"("fileHash");

-- CreateIndex
CREATE INDEX "EditalDocument_status_competitionId_idx" ON "EditalDocument"("status", "competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "EditalDocument_competitionId_url_key" ON "EditalDocument"("competitionId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "EditalExtraction_documentId_key" ON "EditalExtraction"("documentId");

-- CreateIndex
CREATE INDEX "EditalChange_competitionId_status_idx" ON "EditalChange"("competitionId", "status");

-- AddForeignKey
ALTER TABLE "EditalSource" ADD CONSTRAINT "EditalSource_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditalDocument" ADD CONSTRAINT "EditalDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EditalSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditalDocument" ADD CONSTRAINT "EditalDocument_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditalExtraction" ADD CONSTRAINT "EditalExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EditalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditalExtraction" ADD CONSTRAINT "EditalExtraction_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditalChange" ADD CONSTRAINT "EditalChange_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EditalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditalChange" ADD CONSTRAINT "EditalChange_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
