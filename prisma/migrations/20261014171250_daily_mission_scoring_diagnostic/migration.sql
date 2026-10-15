-- CreateEnum
CREATE TYPE "ScoringMode" AS ENUM ('RIGHT_COUNT', 'PENALTY');

-- CreateEnum
CREATE TYPE "SimulationPurpose" AS ENUM ('PRACTICE', 'DIAGNOSTIC');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "missionMinutes" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "Simulation" ADD COLUMN     "examMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purpose" "SimulationPurpose" NOT NULL DEFAULT 'PRACTICE',
ADD COLUMN     "scoringRuleId" TEXT;

-- AlterTable
ALTER TABLE "SimulationAnswer" ADD COLUMN     "timeSpentSec" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SimulationAttempt" ADD COLUMN     "ruleDetail" JSONB,
ADD COLUMN     "ruleScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "StudentCompetition" ADD COLUMN     "cutoffMaxScore" DOUBLE PRECISION,
ADD COLUMN     "cutoffScore" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ScoringRule" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "year" INTEGER,
    "mode" "ScoringMode" NOT NULL DEFAULT 'RIGHT_COUNT',
    "wrongPenalty" DOUBLE PRECISION,
    "durationMinutes" INTEGER,
    "subjects" JSONB NOT NULL,
    "minTotalShare" DOUBLE PRECISION,
    "cutoffScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "sourceUrl" TEXT,
    "sourceNote" TEXT,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "targetMinutes" INTEGER NOT NULL,
    "plan" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoringRule_competitionId_year_idx" ON "ScoringRule"("competitionId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMission_userId_date_key" ON "DailyMission"("userId", "date");

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_scoringRuleId_fkey" FOREIGN KEY ("scoringRuleId") REFERENCES "ScoringRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringRule" ADD CONSTRAINT "ScoringRule_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMission" ADD CONSTRAINT "DailyMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
