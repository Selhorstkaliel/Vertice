-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "TafSex" AS ENUM ('MALE', 'FEMALE', 'BOTH');

-- AlterTable
ALTER TABLE "CompetitionStage" ADD COLUMN     "endDate" DATE,
ADD COLUMN     "startDate" DATE;

-- AlterTable
ALTER TABLE "MilitaryTest" ADD COLUMN     "standardId" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "sex" "Sex";

-- AlterTable
ALTER TABLE "StudentStage" ADD COLUMN     "dateFromCatalog" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CompetitionTafStandard" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "year" INTEGER,
    "test" TEXT NOT NULL,
    "sex" "TafSex" NOT NULL,
    "ageRange" TEXT,
    "index" TEXT NOT NULL,
    "unitText" TEXT NOT NULL,
    "modality" "PhysicalModality" NOT NULL,
    "unit" "MeasureUnit",
    "betterWhen" "BetterWhen",
    "target" DOUBLE PRECISION,
    "distanceMeters" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'VERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionTafStandard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitionTafStandard_competitionId_sex_idx" ON "CompetitionTafStandard"("competitionId", "sex");

-- AddForeignKey
ALTER TABLE "MilitaryTest" ADD CONSTRAINT "MilitaryTest_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "CompetitionTafStandard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTafStandard" ADD CONSTRAINT "CompetitionTafStandard_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

