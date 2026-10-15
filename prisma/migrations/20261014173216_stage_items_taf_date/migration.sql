-- CreateEnum
CREATE TYPE "StageItemKind" AS ENUM ('DOCUMENT', 'HEALTH_EXAM', 'REGISTRATION_DEADLINE', 'APPEAL_DEADLINE', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STAGE_DEADLINE';

-- AlterTable
ALTER TABLE "MilitaryTest" ADD COLUMN     "testDate" DATE;

-- CreateTable
CREATE TABLE "CompetitionStageItem" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "kind" "StageItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE,
    "order" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT,
    "sourceYear" INTEGER,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionStageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentStageItem" (
    "id" TEXT NOT NULL,
    "studentStageId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "kind" "StageItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" DATE,
    "dateFromCatalog" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT,
    "sourceYear" INTEGER,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'USER_PROVIDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentStageItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionStageItem_stageId_order_idx" ON "CompetitionStageItem"("stageId", "order");

-- CreateIndex
CREATE INDEX "StudentStageItem_studentStageId_order_idx" ON "StudentStageItem"("studentStageId", "order");

-- CreateIndex
CREATE INDEX "StudentStageItem_dueDate_idx" ON "StudentStageItem"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "StudentStageItem_studentStageId_catalogItemId_key" ON "StudentStageItem"("studentStageId", "catalogItemId");

-- AddForeignKey
ALTER TABLE "CompetitionStageItem" ADD CONSTRAINT "CompetitionStageItem_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "CompetitionStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStageItem" ADD CONSTRAINT "StudentStageItem_studentStageId_fkey" FOREIGN KEY ("studentStageId") REFERENCES "StudentStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentStageItem" ADD CONSTRAINT "StudentStageItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CompetitionStageItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
